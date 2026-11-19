"""Exercise tray notification callbacks in a disposable Windows copy of a release executable.

Usage: python scripts/test-tray-window.py path/to/devstackbox.exe
Run in an interactive Windows session with Explorer. Service control uses separate tests.
"""
import argparse
import ctypes
from ctypes import wintypes
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time


def wait_for(condition, description, timeout=12):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = condition()
        if result:
            return result
        time.sleep(0.08)
    raise AssertionError(description)


def check_window(executable, directory):
    user32 = ctypes.windll.user32
    enum_callback = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    program = directory / "devstackbox.exe"
    shutil.copyfile(executable, program)
    env = dict(os.environ, DEVSTACKBOX_DATA_DIR=str(directory / "profile"),
               WEBVIEW2_USER_DATA_FOLDER=str(directory / "webview"))
    process = subprocess.Popen([str(program)], cwd=directory, env=env)

    def windows():
        found = {}

        @enum_callback
        def collect(hwnd, _):
            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if pid.value == process.pid:
                name = ctypes.create_unicode_buffer(160)
                user32.GetClassNameW(hwnd, name, len(name))
                found[name.value] = hwnd
            return True

        user32.EnumWindows(collect, 0)
        return found

    try:
        main = wait_for(lambda: windows().get("Tauri Window"), "Missing main window")
        tray = wait_for(lambda: windows().get("tray_icon_app"), "Missing tray window")

        # tray-icon 0.23.1 registers 6002 as the shell notification callback.
        # WM_LBUTTONDOWN, WM_LBUTTONUP and WM_LBUTTONDBLCLK follow Explorer's sequence.
        def click(double=False):
            for message in ([0x201, 0x202, 0x203, 0x202] if double else [0x201, 0x202]):
                assert user32.PostMessageW(tray, 6002, 0, message)
                time.sleep(0.07)

        def restored():
            return user32.IsWindowVisible(main) and not user32.IsIconic(main)

        assert user32.PostMessageW(main, 0x10, 0, 0)  # WM_CLOSE goes through close-to-tray.
        wait_for(lambda: not user32.IsWindowVisible(main), "Close did not hide the window")
        click()
        wait_for(restored, "Single-click did not reopen the hidden window")

        user32.ShowWindow(main, 6)  # SW_MINIMIZE
        wait_for(lambda: user32.IsIconic(main), "Window did not minimize")
        click(double=True)
        wait_for(restored, "Double-click did not restore the minimized window")

        user32.ShowWindow(main, 3)  # SW_MAXIMIZE
        click(double=True)
        time.sleep(0.3)
        assert restored() and user32.IsZoomed(main), "Double-click lost the maximized state"
        click()
        time.sleep(0.3)
        assert restored(), "Single-click hid the visible window"
        assert windows().get("Tauri Window") == main, "Activation created a different window"

        assert user32.PostMessageW(tray, 6002, 0, 0x205)  # WM_RBUTTONUP
        wait_for(lambda: windows().get("#32768"), "Right-click did not open the native menu")
        assert restored(), "Opening the menu changed window visibility"
        user32.PostMessageW(tray, 0x1f, 0, 0)  # WM_CANCELMODE
        wait_for(lambda: "#32768" not in windows(), "Context menu did not dismiss")
    finally:
        process.terminate()
        process.wait(timeout=10)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("executable", type=Path)
    args = parser.parse_args()
    if os.name != "nt":
        parser.error("This test needs Windows Explorer.")
    with tempfile.TemporaryDirectory(prefix="dsb-tray-window-",ignore_cleanup_errors=True) as sandbox:
        check_window(args.executable.resolve(strict=True), Path(sandbox))
    print("PASS: hidden, minimized, visible and maximized activation and native context menu")
