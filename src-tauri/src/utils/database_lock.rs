//! A nonblocking, Send guard permits the service stop path to hold exclusivity across await.
use std::sync::atomic::{AtomicBool, Ordering};
pub struct DatabaseLock(AtomicBool);
pub struct Guard<'a>(&'a AtomicBool);
impl DatabaseLock {
    pub const fn new() -> Self {
        Self(AtomicBool::new(false))
    }
    pub fn try_lock(&self) -> Result<Guard<'_>, &'static str> {
        self.0
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| Guard(&self.0))
            .map_err(|_| "Another database operation is in progress")
    }
    pub fn lock(&self) -> Result<Guard<'_>, &'static str> {
        self.try_lock()
    }
    pub fn is_busy(&self) -> bool {
        self.0.load(Ordering::Acquire)
    }
}
impl Drop for Guard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exclusive_until_released() {
        let lock = DatabaseLock::new();
        let guard = lock.try_lock().unwrap();
        assert!(lock.try_lock().is_err());
        drop(guard);
        assert!(lock.try_lock().is_ok());
    }
}
