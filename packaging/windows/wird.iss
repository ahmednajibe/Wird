; Wird installer (Inno Setup 6). Per-user install: no admin, no UAC.
; Build with: ISCC.exe /DAppVersion=<ver> /DSourceExe=<abs path to build\sea\wird.exe> /O<abs out dir> wird.iss

#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif
#ifndef SourceExe
  #define SourceExe "..\..\build\sea\wird.exe"
#endif
#ifndef SourceLicense
  #define SourceLicense "..\..\LICENSE"
#endif
#ifndef SourceNotices
  #define SourceNotices "..\..\build\notices\THIRD_PARTY_NOTICES.txt"
#endif

[Setup]
AppId={{7C3E9A52-4B1D-4F8E-9A6B-2D5C8E1F0A37}
AppName=Wird
AppVersion={#AppVersion}
AppVerName=Wird {#AppVersion}
AppPublisher=Wird
AppPublisherURL=https://github.com/ahmednajibe/Wird
AppSupportURL=https://github.com/ahmednajibe/Wird
AppUpdatesURL=https://github.com/ahmednajibe/Wird
PrivilegesRequired=lowest
DefaultDirName={autopf}\Wird
DisableProgramGroupPage=yes
DisableDirPage=auto
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\..\assets\brand\wird.ico
UninstallDisplayIcon={app}\wird.exe
UninstallDisplayName=Wird
OutputBaseFilename=Wird-{#AppVersion}-win-x64-setup
; force (not yes): wird.exe has no window, so Restart Manager cannot close it
; gracefully; force terminates it so upgrades over a running copy succeed.
CloseApplications=force
RestartApplications=no
VersionInfoVersion={#AppVersion}.0
VersionInfoProductName=Wird

; NOTE: the uninstaller must never delete user data. The data directory
; (%LOCALAPPDATA%\Wird, or <exe>\data in portable mode) is intentionally never
; referenced here: no [UninstallDelete]/[InstallDelete] entries at all.

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; Flags: checkedonce

[Files]
Source: "{#SourceExe}"; DestDir: "{app}"; DestName: "wird.exe"; Flags: ignoreversion
Source: "{#SourceLicense}"; DestDir: "{app}"; DestName: "LICENSE.txt"
Source: "{#SourceNotices}"; DestDir: "{app}"; DestName: "THIRD_PARTY_NOTICES.txt"

[Icons]
Name: "{autoprograms}\Wird"; Filename: "{app}\wird.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Wird"; Filename: "{app}\wird.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\wird.exe"; Description: "Launch Wird"; Flags: nowait postinstall skipifsilent
