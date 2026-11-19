//! Database clients only. Never use this launcher for the persistent MySQL server.
//! Windows 10+: assign a kill-on-close job atomically through CreateProcessW's
//! JOB_LIST attribute. There is no unassigned runnable/suspended child interval.
use std::{
    ffi::{OsStr, OsString},
    fs::File,
    io,
    path::PathBuf,
    process::{ExitStatus, Output},
};

pub enum Stdio {
    Null,
    Piped,
    File(File),
}
impl Stdio {
    pub fn null() -> Self {
        Self::Null
    }
    pub fn piped() -> Self {
        Self::Piped
    }
}
impl From<File> for Stdio {
    fn from(file: File) -> Self {
        Self::File(file)
    }
}

pub struct Command {
    program: PathBuf,
    args: Vec<OsString>,
    env: Vec<(OsString, OsString)>,
    streams: [Stdio; 3],
}
impl Command {
    pub fn new(program: impl AsRef<OsStr>) -> Self {
        Self {
            program: PathBuf::from(program.as_ref()),
            args: Vec::new(),
            env: Vec::new(),
            streams: [Stdio::Null, Stdio::Null, Stdio::Null],
        }
    }
    pub fn arg(&mut self, value: impl AsRef<OsStr>) -> &mut Self {
        self.args.push(value.as_ref().into());
        self
    }
    pub fn args(&mut self, values: impl IntoIterator<Item = impl AsRef<OsStr>>) -> &mut Self {
        for value in values {
            self.arg(value);
        }
        self
    }
    pub fn env(&mut self, key: impl AsRef<OsStr>, value: impl AsRef<OsStr>) -> &mut Self {
        self.env.push((key.as_ref().into(), value.as_ref().into()));
        self
    }
    pub fn stdin(&mut self, value: Stdio) -> &mut Self {
        self.streams[0] = value;
        self
    }
    pub fn stdout(&mut self, value: Stdio) -> &mut Self {
        self.streams[1] = value;
        self
    }
    pub fn stderr(&mut self, value: Stdio) -> &mut Self {
        self.streams[2] = value;
        self
    }
    pub fn spawn(&mut self) -> io::Result<Child> {
        platform::spawn(self)
    }
    pub fn output(&mut self) -> io::Result<Output> {
        self.stdout(Stdio::piped()).stderr(Stdio::piped());
        let child = self.spawn()?;
        crate::utils::database_io::wait_bounded(
            child,
            std::time::Duration::from_secs(30),
            8 * 1024 * 1024,
            None,
        )
        .map_err(io::Error::other)
    }
}

pub use platform::Child;

#[cfg(windows)]
mod platform {
    use super::*;
    use std::{
        mem::{size_of, zeroed},
        os::windows::{
            ffi::OsStrExt,
            io::{AsRawHandle, FromRawHandle, OwnedHandle},
            process::ExitStatusExt,
        },
        ptr::{null, null_mut},
    };
    use windows_sys::Win32::{
        Foundation::*,
        System::{JobObjects::*, Pipes::CreatePipe, Threading::*},
    };

    pub struct Child {
        pub stdin: Option<File>,
        pub stdout: Option<File>,
        pub stderr: Option<File>,
        process: OwnedHandle,
        job: OwnedHandle,
        pid: u32,
    }
    impl Child {
        pub fn id(&self) -> u32 {
            self.pid
        }
        pub fn kill(&mut self) -> io::Result<()> {
            if unsafe { TerminateJobObject(self.job.as_raw_handle(), 1) } == 0 {
                Err(io::Error::last_os_error())
            } else {
                Ok(())
            }
        }
        pub fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> {
            match unsafe { WaitForSingleObject(self.process.as_raw_handle(), 0) } {
                WAIT_TIMEOUT => Ok(None),
                WAIT_OBJECT_0 => {
                    let mut code = 0;
                    if unsafe { GetExitCodeProcess(self.process.as_raw_handle(), &mut code) } == 0 {
                        return Err(io::Error::last_os_error());
                    }
                    Ok(Some(ExitStatus::from_raw(code)))
                }
                _ => Err(io::Error::last_os_error()),
            }
        }
        pub fn wait(&mut self) -> io::Result<ExitStatus> {
            self.stdin.take();
            if unsafe { WaitForSingleObject(self.process.as_raw_handle(), INFINITE) }
                != WAIT_OBJECT_0
            {
                return Err(io::Error::last_os_error());
            }
            self.try_wait()?
                .ok_or_else(|| io::Error::other("Client wait did not complete"))
        }
    }
    impl Drop for Child {
        fn drop(&mut self) {
            // RAII also handles Rust early returns/unwinding. A forced parent kill
            // closes the non-inherited job handle in the kernel instead.
            let _ = self.kill();
            let _ = self.wait();
        }
    }

    fn wide(value: &OsStr) -> io::Result<Vec<u16>> {
        let mut result: Vec<u16> = value.encode_wide().collect();
        if result.contains(&0) {
            return Err(io::Error::other("NUL in process argument/environment"));
        }
        result.push(0);
        Ok(result)
    }
    // Windows CRT quoting, including backslashes before quotes and closing quote.
    fn quote(value: &OsStr) -> io::Result<Vec<u16>> {
        let units = wide(value)?;
        let mut out = vec![34];
        let mut slashes = 0;
        for &unit in &units[..units.len() - 1] {
            if unit == 92 {
                slashes += 1;
                continue;
            }
            out.extend(std::iter::repeat_n(
                92,
                if unit == 34 { slashes * 2 + 1 } else { slashes },
            ));
            slashes = 0;
            out.push(unit);
        }
        out.extend(std::iter::repeat_n(92, slashes * 2));
        out.push(34);
        Ok(out)
    }
    fn duplicate_inheritable(file: &File) -> io::Result<OwnedHandle> {
        let mut handle = null_mut();
        if unsafe {
            DuplicateHandle(
                GetCurrentProcess(),
                file.as_raw_handle(),
                GetCurrentProcess(),
                &mut handle,
                0,
                1,
                DUPLICATE_SAME_ACCESS,
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        Ok(unsafe { OwnedHandle::from_raw_handle(handle) })
    }
    fn stream(spec: &Stdio, input: bool) -> io::Result<(OwnedHandle, Option<File>)> {
        match spec {
            Stdio::File(file) => Ok((duplicate_inheritable(file)?, None)),
            Stdio::Null => {
                let file = File::options().read(input).write(!input).open("NUL")?;
                Ok((duplicate_inheritable(&file)?, None))
            }
            Stdio::Piped => {
                let (mut read, mut write) = (null_mut(), null_mut());
                if unsafe { CreatePipe(&mut read, &mut write, null(), 0) } == 0 {
                    return Err(io::Error::last_os_error());
                }
                let read = unsafe { File::from_raw_handle(read) };
                let write = unsafe { File::from_raw_handle(write) };
                if input {
                    Ok((duplicate_inheritable(&read)?, Some(write)))
                } else {
                    Ok((duplicate_inheritable(&write)?, Some(read)))
                }
            }
        }
    }
    struct Attributes(Vec<usize>);
    impl Attributes {
        fn new() -> io::Result<Self> {
            let mut bytes = 0;
            unsafe {
                InitializeProcThreadAttributeList(null_mut(), 2, 0, &mut bytes);
            }
            if bytes == 0 {
                return Err(io::Error::last_os_error());
            }
            let mut storage = vec![0usize; bytes.div_ceil(size_of::<usize>())];
            if unsafe {
                InitializeProcThreadAttributeList(storage.as_mut_ptr().cast(), 2, 0, &mut bytes)
            } == 0
            {
                return Err(io::Error::last_os_error());
            }
            Ok(Self(storage))
        }
        fn ptr(&mut self) -> LPPROC_THREAD_ATTRIBUTE_LIST {
            self.0.as_mut_ptr().cast()
        }
    }
    impl Drop for Attributes {
        fn drop(&mut self) {
            unsafe {
                DeleteProcThreadAttributeList(self.ptr());
            }
        }
    }

    pub fn spawn(command: &mut Command) -> io::Result<Child> {
        spawn_inner(command, false)
    }
    fn spawn_inner(command: &mut Command, invalid_job: bool) -> io::Result<Child> {
        if !command.program.is_absolute()
            || !command
                .program
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("exe"))
        {
            return Err(io::Error::other(
                "Contained client requires an absolute .exe path",
            ));
        }
        let program = wide(command.program.as_os_str())?;
        let mut line = quote(command.program.as_os_str())?;
        for arg in &command.args {
            line.push(32);
            line.extend(quote(arg)?);
        }
        line.push(0);
        let mut environment = std::collections::BTreeMap::new();
        for (key, value) in std::env::vars_os().chain(command.env.iter().cloned()) {
            let key = key
                .to_str()
                .ok_or_else(|| io::Error::other("Invalid environment key"))?
                .to_uppercase();
            environment.insert(key, value);
        }
        let mut env = Vec::new();
        for (key, value) in environment {
            let mut entry = OsString::from(key);
            entry.push("=");
            entry.push(value);
            env.extend(wide(&entry)?);
        }
        env.push(0);
        let job = unsafe { CreateJobObjectW(null(), null()) };
        if job.is_null() {
            return Err(io::Error::last_os_error());
        }
        let job = unsafe { OwnedHandle::from_raw_handle(job) };
        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { zeroed() };
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if unsafe {
            SetInformationJobObject(
                job.as_raw_handle(),
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        let (input, stdin) = stream(&command.streams[0], true)?;
        let (output, stdout) = stream(&command.streams[1], false)?;
        let (error, stderr) = stream(&command.streams[2], false)?;
        let handles = [
            input.as_raw_handle(),
            output.as_raw_handle(),
            error.as_raw_handle(),
        ];
        // Invalid handle is used only by the private in-module regression test.
        let jobs = [if invalid_job {
            INVALID_HANDLE_VALUE
        } else {
            job.as_raw_handle()
        }];
        let mut attrs = Attributes::new()?;
        // Attribute values and handle owners stay alive through CreateProcessW.
        for (kind, values) in [
            (PROC_THREAD_ATTRIBUTE_HANDLE_LIST, handles.as_slice()),
            (PROC_THREAD_ATTRIBUTE_JOB_LIST, jobs.as_slice()),
        ] {
            if unsafe {
                UpdateProcThreadAttribute(
                    attrs.ptr(),
                    0,
                    kind as usize,
                    values.as_ptr().cast(),
                    std::mem::size_of_val(values),
                    null_mut(),
                    null(),
                )
            } == 0
            {
                return Err(io::Error::last_os_error());
            }
        }
        let mut startup: STARTUPINFOEXW = unsafe { zeroed() };
        startup.StartupInfo.cb = size_of::<STARTUPINFOEXW>() as u32;
        startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
        startup.StartupInfo.hStdInput = input.as_raw_handle();
        startup.StartupInfo.hStdOutput = output.as_raw_handle();
        startup.StartupInfo.hStdError = error.as_raw_handle();
        startup.lpAttributeList = attrs.ptr();
        let mut info: PROCESS_INFORMATION = unsafe { zeroed() };
        if unsafe {
            CreateProcessW(
                program.as_ptr(),
                line.as_mut_ptr(),
                null(),
                null(),
                1,
                CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT,
                env.as_ptr().cast(),
                null(),
                &startup.StartupInfo,
                &mut info,
            )
        } == 0
        {
            return Err(io::Error::other(format!(
                "Contained client creation failed (no uncontained fallback): {}",
                io::Error::last_os_error()
            )));
        }
        let process = unsafe { OwnedHandle::from_raw_handle(info.hProcess) };
        let _thread = unsafe { OwnedHandle::from_raw_handle(info.hThread) };
        Ok(Child {
            stdin,
            stdout,
            stderr,
            process,
            job,
            pid: info.dwProcessId,
        })
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        fn powershell() -> Command {
            Command::new(
                PathBuf::from(std::env::var_os("SystemRoot").unwrap())
                    .join("System32/WindowsPowerShell/v1.0/powershell.exe"),
            )
        }
        #[test]
        fn creation_failure_never_runs_child() {
            let target = std::env::temp_dir().join(crate::utils::database_io::unique_suffix());
            let mut cmd = powershell();
            cmd.args([
                "-NoProfile",
                "-Command",
                &format!("[IO.File]::WriteAllText('{}', 'unsafe')", target.display()),
            ]);
            assert!(spawn_inner(&mut cmd, true).is_err());
            assert!(!target.exists());
        }
        #[test]
        fn errors_and_drop_release_client_process() {
            let mut cmd = powershell();
            cmd.args(["-NoProfile", "-Command", "exit 7"]);
            assert_eq!(cmd.output().unwrap().status.code(), Some(7));
            let mut cmd = powershell();
            cmd.args(["-NoProfile", "-Command", "Start-Sleep -Seconds 60"]);
            let child = cmd.spawn().unwrap();
            let raw = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, child.id()) };
            assert!(!raw.is_null());
            let process = unsafe { OwnedHandle::from_raw_handle(raw) };
            drop(child);
            assert_eq!(
                unsafe { WaitForSingleObject(process.as_raw_handle(), 1000) },
                WAIT_OBJECT_0
            );
        }
        #[test]
        fn job_is_non_inheritable_and_child_is_assigned() {
            let mut cmd = powershell();
            cmd.args(["-NoProfile", "-Command", "Start-Sleep -Seconds 60"]);
            let child = cmd.spawn().unwrap();
            let (mut flags, mut assigned) = (0, 0);
            assert_ne!(
                unsafe { GetHandleInformation(child.job.as_raw_handle(), &mut flags) },
                0
            );
            assert_eq!(flags & HANDLE_FLAG_INHERIT, 0);
            assert_ne!(
                unsafe {
                    IsProcessInJob(
                        child.process.as_raw_handle(),
                        child.job.as_raw_handle(),
                        &mut assigned,
                    )
                },
                0
            );
            assert_eq!(assigned, 1);
        }
        #[test]
        fn crt_quoting_preserves_quotes_and_trailing_slashes() {
            assert_eq!(
                String::from_utf16(&quote(OsStr::new("a b\\")).unwrap()).unwrap(),
                "\"a b\\\\\""
            );
            assert_eq!(
                String::from_utf16(&quote(OsStr::new("a\"b")).unwrap()).unwrap(),
                "\"a\\\"b\""
            );
            assert!(quote(OsStr::new("a\0b")).is_err());
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::*;
    pub type Child = std::process::Child;
    pub fn spawn(_: &mut Command) -> io::Result<Child> {
        Err(io::Error::other(
            "Database process containment requires Windows 10 or newer",
        ))
    }
}
