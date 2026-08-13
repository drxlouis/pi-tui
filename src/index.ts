import theme from "./theme";

import {
  createCliRenderer,
  Text,
  BoxRenderable,
  TextRenderable,
  ASCIIFontRenderable,
  type CliRenderer,
  t,
} from "@opentui/core";

const buildHeader = (renderer: CliRenderer) => {
  const header = new BoxRenderable(renderer, {
    id: "header",
    flexDirection: "column",
    alignItems: "center",
    titleAlignment: "center",
    paddingTop: 1,
    height: 9,
  });

  header.add(
    new ASCIIFontRenderable(renderer, {
      id: "title",
      text: "TUI",
      font: "block",
      color: theme.blue,
      maxWidth: "100%",
    }),
  );

  header.add(
    new TextRenderable(renderer, {
      id: "subtitle",
      alignItems: "center",
      content: "By Louis Dierickx",
      fg: theme.dim,
    }),
  );

  return header;
};

const buildTui = (renderer: CliRenderer) => {
  const main = new BoxRenderable(renderer, {
    id: "main",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    backgroundColor: theme.bg,
  });

  main.add(buildHeader(renderer));
  renderer.root.add(main);
};

const main = async () => {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  });

  buildTui(renderer);
  renderer.start();
};

main();
