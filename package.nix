{
  buildNpmPackage,
  chromium,
  importNpmLock,
  lib,
  makeWrapper,
}:
buildNpmPackage rec {
  pname = "excalidraw-mcp";
  version = "1.0.0";

  src = ./.;

  npmDepsHash = "sha256-OnxpXLrHAnLNMUizA9nBHgBIq0bZnt4C19WLqyKMD0E=";

  # npmDeps = importNpmLock {
  #   npmRoot = ./.;
  # };

  env = {
    PUPPETEER_SKIP_DOWNLOAD = true;
  };

  dontNpmBuild = true;

  nativeBuildInputs = [ makeWrapper ];

  postInstall = ''
    wrapProgram $out/bin/excalidraw-mcp \
      --set PUPPETEER_EXECUTABLE_PATH ${lib.getExe chromium}
  '';

  meta = {
    description = "Powerful Drawing API for LLM Integration";
    homepage = "https://github.com/p-zany/mcp_excalidraw";
    license = lib.licenses.mit;
    mainProgram = "excalidraw-mcp";
    maintainers = with lib.maintainers; [ p-zany ];
  };
}
