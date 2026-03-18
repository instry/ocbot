#define MyAppName "Ocbot"
#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif
#ifndef TargetArch
  #define TargetArch "x64"
#endif
#define MyAppPublisher "Ocbot Team"
#define MyAppURL "https://github.com/instry/ocbot"
#define MyAppExeName "ocbot.exe"
#define VCRedistExe "vc_redist." + TargetArch + ".exe"

[Setup]
; NOTE: The value of AppId uniquely identifies this application. Do not use the same AppId value in installers for other applications.
; (To generate a new GUID, click Tools | Generate GUID inside the IDE.)
AppId={{E63920F5-8575-438B-A9D6-701234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
;AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
; Remove the following line to run in administrative install mode (install for all users.)
PrivilegesRequired=lowest
OutputBaseFilename=Ocbot-Setup-{#MyAppVersion}-{#TargetArch}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#MyAppExeName}
CloseApplications=force
CloseApplicationsFilter=*.exe
ArchitecturesAllowed={#TargetArch}
ArchitecturesInstallIn64BitMode={#TargetArch}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; SourceDir must be defined via command line /dSourceDir="..."
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; VC++ Redistributable (bundled in staging dir by package.py)
Source: "{#SourceDir}\..\deps\{#VCRedistExe}"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: VCRedistNeeded

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
; Install VC++ Redistributable silently before launching app
Filename: "{tmp}\{#VCRedistExe}"; Parameters: "/install /quiet /norestart"; StatusMsg: "Installing Visual C++ Runtime..."; Flags: waituntilterminated; Check: VCRedistNeeded
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  // Force-kill all Ocbot processes (Chromium spawns many child processes)
  Exec('taskkill', '/F /IM {#MyAppExeName} /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;

function VCRedistNeeded: Boolean;
var
  Version: String;
  RegKey: String;
begin
  // Check if VC++ 2015-2022 Redistributable (14.x) is installed
  // Registry key exists when any 14.x version is installed
  #if TargetArch == "arm64"
    RegKey := 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\ARM64';
  #else
    RegKey := 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64';
  #endif

  Result := not RegQueryStringValue(HKLM, RegKey, 'Version', Version);
  if Result then
    Log('VC++ Redistributable not found, will install')
  else
    Log('VC++ Redistributable found: ' + Version);
end;
