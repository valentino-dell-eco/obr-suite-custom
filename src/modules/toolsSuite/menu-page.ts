// Suite side-menu iframe. Asks background for the item list, renders
// rows, and broadcasts a pick when the user clicks one.

import OBR from "@owlbear-rodeo/sdk";
import {
  BC_SUITE_MENU_REQ,
  BC_SUITE_MENU_RES,
  BC_SUITE_PICK,
  type SuiteKind,
} from "./index";

type Row = { id: string; label: string; icon: string; hint?: string };

const params = new URLSearchParams(location.search);
const suite = (params.get("suite") === "gm" ? "gm" : "shared") as SuiteKind;

const titleEl = document.getElementById("title")!;
const listEl = document.getElementById("list")!;

titleEl.textContent = suite === "gm" ? "GM Tools" : "Tools Suite";

function render(items: Row[]): void {
  listEl.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent =
      suite === "gm"
        ? "No GM tools enabled"
        : "No tools enabled";
    listEl.appendChild(empty);
    return;
  }
  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row";
    btn.title = item.label;

    const icoWrap = document.createElement("div");
    icoWrap.className = "ico-wrap";
    const img = document.createElement("img");
    img.className = "ico";
    img.src = item.icon;
    img.alt = "";
    img.draggable = false;
    icoWrap.appendChild(img);

    const text = document.createElement("div");
    text.className = "text";
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = item.label;
    text.appendChild(label);
    if (item.hint) {
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = item.hint;
      text.appendChild(hint);
    }

    btn.appendChild(icoWrap);
    btn.appendChild(text);
    btn.addEventListener("click", () => {
      void OBR.broadcast.sendMessage(
        BC_SUITE_PICK,
        { id: item.id },
        { destination: "LOCAL" },
      );
    });
    listEl.appendChild(btn);
  }
}

OBR.onReady(() => {
  OBR.broadcast.onMessage(BC_SUITE_MENU_RES, (event) => {
    const data = event.data as { suite?: SuiteKind; items?: Row[] } | undefined;
    if (!data || data.suite !== suite) return;
    render(Array.isArray(data.items) ? data.items : []);
  });
  void OBR.broadcast.sendMessage(
    BC_SUITE_MENU_REQ,
    { suite },
    { destination: "LOCAL" },
  );
});
