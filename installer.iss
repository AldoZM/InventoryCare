[Setup]
AppName=InventaryCare
AppVersion=1.0.0
AppPublisher=InventaryCare
AppPublisherURL=http://localhost:8080
DefaultDirName={autopf}\InventaryCare
DefaultGroupName=InventaryCare
OutputDir=Output
OutputBaseFilename=InventaryCare_Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\InventaryCare.exe
PrivilegesRequired=admin
SetupIconFile=assets\icon.ico

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el escritorio"; GroupDescription: "Iconos adicionales:"
Name: "startup"; Description: "Iniciar InventaryCare autom{225}ticamente al encender el PC"; GroupDescription: "Opciones de inicio:"

[Files]
Source: "dist\InventaryCare\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\InventaryCare"; Filename: "{app}\InventaryCare.exe"
Name: "{userdesktop}\InventaryCare"; Filename: "{app}\InventaryCare.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "InventaryCare"; ValueData: """{app}\InventaryCare.exe"""; Flags: uninsdeletevalue; Tasks: startup

[Run]
Filename: "{app}\InventaryCare.exe"; Description: "Abrir InventaryCare ahora"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill"; Parameters: "/F /IM InventaryCare.exe"; Flags: runhidden

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  // Database in %APPDATA% is intentionally NOT deleted so user data survives uninstall
end;
