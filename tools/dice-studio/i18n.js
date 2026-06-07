// Standalone i18n for Dice Studio (and the shared studio chrome).
//
// These studio tools are plain static pages (no bundler), so each ships
// its own tiny i18n module rather than importing the plugin's src/i18n.ts.
// Language is read from the SAME localStorage key the OBR Suite plugin
// uses ("obr-suite/lang") — studio + plugin share the obr-suite-custom.pages.dev
// origin, so a language picked in the plugin carries over. For users who
// open a studio tool directly (no plugin visit) we fall back to the
// browser language. A ZH/EN toggle in the top bar lets anyone override.

export const LANG = (() => {
  try {
    const v = localStorage.getItem("obr-suite/lang");
    if (v === "en" || v === "zh") return v;
  } catch {}
  try {
    return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {}
  return "zh";
})();

// key → { zh, en }. {n}/{s}/… placeholders are filled by the caller via t().
const TR = {
  // shared studio chrome (top-bar nav — identical across all four tools)
  navMonster: { zh: "怪物编辑", en: "Monster" },
  navBuff: { zh: "Buff 合成", en: "Buff FX" },
  navDice: { zh: "骰子工坊", en: "Dice" },
  navMusic: { zh: "音乐板", en: "Music" },
  langToggle: { zh: "EN", en: "中文" },
  langToggleTitle: { zh: "Switch to English", en: "切换到中文" },

  // dice-studio — card titles + hints
  dsDieTitle: { zh: "① 骰子类型 / Die", en: "① Die type" },
  dsDieHint: { zh: "— 选一种骰子，画布会显示该骰面的轮廓参考", en: "— pick a die; the canvas shows that face's outline guide" },
  dsCanvasTitle: { zh: "② 画布 / Canvas", en: "② Canvas" },
  dsCanvasHint: { zh: "— 在轮廓里画你的骰面（数字 / 图案）。轮廓只是参考，不会被导出", en: "— draw your face (number / pattern) inside the outline. The outline is a guide only and is never exported" },
  dsCanvasSize: { zh: "画布尺寸", en: "Canvas size" },
  dsShowGuide: { zh: "显示骰面轮廓参考", en: "Show face outline guide" },
  dsTemplateBtn: { zh: "⬇ 模板图", en: "⬇ Template" },
  dsTemplateBtnTitle: { zh: "下载当前骰种的轮廓模板 PNG（透明背景，含参考网格）", en: "Download the current die's outline template PNG (transparent, with reference grid)" },
  dsExportTitle: { zh: "③ 导出 / Export", en: "③ Export" },
  dsDownloadBtn: { zh: "⬇ 下载 PNG（透明背景）", en: "⬇ Download PNG (transparent)" },
  dsExportHint: { zh: "导出的是带透明背景的 PNG —— 只有你画的内容，不含轮廓参考。可直接做成骰子贴图，或放进 OBR Suite 当素材。", en: "Exports a transparent-background PNG — only what you drew, no outline guide. Use it as a die texture, or as an asset in OBR Suite." },
  dsSavedTitle: { zh: "④ 我的骰面 / Saved", en: "④ Saved faces" },
  dsSavedHint: { zh: "— 存于此浏览器", en: "— stored in this browser" },
  dsHelpSummary: { zh: "使用说明 / How to use", en: "How to use" },
  dsHelp1: { zh: "<b>① 选骰子</b>：d4 / d6 / d8 / d10 / d12 / d20 / d100，画布会画出对应骰面的轮廓参考线", en: "<b>① Pick a die</b>: d4 / d6 / d8 / d10 / d12 / d20 / d100 — the canvas draws that face's outline guide" },
  dsHelp2: { zh: "<b>② 画</b>：画笔 · 橡皮 · 油漆桶 · 直线 / 矩形 / 椭圆 · 吸色 · 选框 / 套索 · 移动 —— Photoshop 基础工具齐全", en: "<b>② Draw</b>: brush · eraser · bucket · line / rect / ellipse · eyedropper · marquee / lasso · move — the usual Photoshop basics" },
  dsHelp3: { zh: "选框 / 套索框出选区后，画笔 · 填充只作用于选区内；移动工具拖动选区像素", en: "With a marquee / lasso selection active, brush · fill only affect inside it; the move tool drags the selected pixels" },
  dsHelp4: { zh: "<b>③ 导出</b>：点「下载 PNG」得到透明背景图；或用画板上的「保存」存进右侧「我的骰面」", en: '<b>③ Export</b>: click "Download PNG" for a transparent image; or use "Save" on the board to store it under "Saved faces"' },
  dsHelpFoot: { zh: "轮廓参考线只是辅助，<b>永远不会出现在导出的 PNG 里</b>。", en: "The outline guide is just an aid — <b>it never appears in the exported PNG</b>." },

  // dice-studio — app.js dynamic strings ({…} placeholders)
  dsTplLabel: { zh: "{label} · 模板参考", en: "{label} · template guide" },
  dsToastResized: { zh: "画布已重设为 {s} × {s}（已清空）", en: "Canvas resized to {s} × {s} (cleared)" },
  dsToastDownloaded: { zh: "已下载 PNG", en: "PNG downloaded" },
  dsToastTplDownloaded: { zh: "已下载 {label} 模板图（{size}×{size}）", en: "Downloaded {label} template ({size}×{size})" },
  dsToastSaveFull: { zh: "保存失败：浏览器本地存储已满", en: "Save failed: browser local storage is full" },
  dsGalleryEmpty: { zh: '还没有保存的骰面。<br>画好后点画板上的「保存」。', en: 'No saved faces yet.<br>Draw one, then click "Save" on the board.' },
  dsGalLoad: { zh: "载入画板继续编辑", en: "Load into the board to keep editing" },
  dsGalDownload: { zh: "下载 PNG", en: "Download PNG" },
  dsGalDelete: { zh: "删除", en: "Delete" },
  dsToastLoaded: { zh: "「{name}」已载入画板", en: '"{name}" loaded into the board' },
  dsSaveLabel: { zh: "💾 保存到「我的骰面」", en: "💾 Save to “Saved faces”" },
  dsFaceName: { zh: "{id} 骰面 {n}", en: "{id} face {n}" },
  dsToastSaved: { zh: "已保存「{name}」", en: '"{name}" saved' },
};

export function t(key, vars) {
  let s = TR[key]?.[LANG] ?? key;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const k = el.dataset.i18n; if (TR[k]) el.textContent = TR[k][LANG];
  });
  root.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const k = el.dataset.i18nHtml; if (TR[k]) el.innerHTML = TR[k][LANG];
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const k = el.dataset.i18nTitle; if (TR[k]) el.title = TR[k][LANG];
  });
  root.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    const k = el.dataset.i18nPh; if (TR[k]) el.placeholder = TR[k][LANG];
  });
  document.documentElement.lang = LANG === "zh" ? "zh-CN" : "en";
}

// Floating ZH/EN toggle injected into .topbar-actions. Clicking persists
// the choice to the shared key and reloads (cheap + bulletproof for a
// static tool — no need to re-render every widget).
export function mountLangToggle() {
  const host = document.querySelector(".topbar-actions");
  if (!host) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pill-link lang-toggle";
  btn.textContent = TR.langToggle[LANG];
  btn.title = TR.langToggleTitle[LANG];
  btn.addEventListener("click", () => {
    try { localStorage.setItem("obr-suite/lang", LANG === "zh" ? "en" : "zh"); } catch {}
    location.reload();
  });
  host.insertBefore(btn, host.firstChild);
}
