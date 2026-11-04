import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import viCatalog from "./i18n.vi.json";

export type Language = "en" | "vi";
type LanguageValue = { language: Language; setLanguage: (language: Language) => void };
const LanguageContext = createContext<LanguageValue | null>(null);
const originals = new WeakMap<Text, string>();
const translated = new WeakMap<Text, string>();

const loadLanguage = (): Language => { try { return localStorage.getItem("hts.language") === "vi" ? "vi" : "en"; } catch { return "en"; } };

const criticalVi: Record<string, string> = {
  "ARTWORK PENDING": "ĐANG CHỜ MINH HỌA", "CREATE ROOM": "TẠO PHÒNG", "END TURN": "KẾT THÚC LƯỢT",
  "JOIN ROOM": "VÀO PHÒNG", "ROOM PLAYERS": "NGƯỜI CHƠI TRONG PHÒNG", "VIEW GAME": "XEM BÀN CHƠI",
};

/** Canonical game glossary. Every screen, dynamic status and card rule uses this one rule set. */
export const COMMON_VI_TERMS = [
  [/\bPARTY LEADER\b/gi, "THỦ LĨNH"], [/\bLEADER\b/gi, "THỦ LĨNH"], [/\bCURSED ITEM\b/gi, "VẬT PHẨM BỊ NGUYỀN"],
  [/\bCHALLENGE\b/gi, "THÁCH ĐẤU"], [/\bDESTROY\b/gi, "TIÊU DIỆT"], [/\bDISCARD\b/gi, "BỎ"],
  [/\bDRAW\b/gi, "RÚT"], [/\bSTEAL\b/gi, "CƯỚP"], [/\bMODIFIER\b/gi, "ĐIỀU CHỈNH"],
  [/\bATTACK\b/gi, "TẤN CÔNG"], [/\bROLL\b/gi, "ĐỔ XÚC XẮC"], [/\bPLAY\b/gi, "CHƠI"],
  [/\bSKIP\b/gi, "BỎ QUA"], [/\bPASS\b/gi, "NHƯỜNG LƯỢT"], [/\bHERO\b/gi, "ANH HÙNG"],
  [/\bMAGIC\b/gi, "PHÉP THUẬT"], [/\bMONSTER\b/gi, "QUÁI VẬT"], [/\bITEM\b/gi, "VẬT PHẨM"],
  [/\bROOM\b/gi, "PHÒNG"], [/\bTURN\b/gi, "LƯỢT"], [/\bWAITING\b/gi, "ĐANG CHỜ"],
  [/\bCOMPLETED\b/gi, "HOÀN TẤT"], [/\bACTIVE\b/gi, "ĐANG HOẠT ĐỘNG"],
  [/\bPLAYERS?\b/gi, "NGƯỜI CHƠI"], [/\bCARDS?\b/gi, "LÁ BÀI"],
] as const satisfies readonly (readonly [RegExp, string])[];

function applyCommonTerms(value: string): string {
  return COMMON_VI_TERMS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), value);
}

function normalizeVietnamese(value: string): string {
  return applyCommonTerms(value
    .replace(/Lãnh đạo Đảng/gi, "Thủ lĩnh tổ đội")
    .replace(/Công cụ sửa đổi/gi, "Điều chỉnh")
    .replace(/VẼ TRANH/g, "RÚT")
    .replace(/\bSTEAL\b/g, "CƯỚP")
    .replace(/\bKIẾM\b/g, "CƯỚP")
    .replace(/\bPHÁT HIỆN\b/g, "TIÊU DIỆT")
    .replace(/\bPHÁ HỦY\b/g, "TIÊU DIỆT")
    .replace(/\bHỦY\b/g, "TIÊU DIỆT")
    .replace(/\bTHỬ THÁCH\b/g, "THÁCH ĐẤU")
    .replace(/\bẢo thuật\b/g, "Phép thuật")
    .replace(/\bMục\b/g, "Vật phẩm")
    .replace(/\bcuộn\b/gi, "đổ xúc xắc")
    .replace(/\blăn\b/gi, "đổ xúc xắc"));
}

export function translateVi(value: string): string {
  if (criticalVi[value]) return criticalVi[value];
  const direct = (viCatalog as Record<string, string>)[value];
  if (direct) return normalizeVietnamese(direct);
  const trimmed = value.trim();
  const exact = (viCatalog as Record<string, string>)[trimmed];
  if (exact) return value.replace(trimmed, normalizeVietnamese(exact));
  return normalizeVietnamese(applyCommonTerms(value));
}

function localizeText(node: Text, language: Language) {
  const current = node.data;
  const last = translated.get(node);
  if (language === "en") {
    const original = originals.get(node);
    if (original !== undefined && current === last) node.data = original;
    translated.delete(node);
    return;
  }
  if (!last || current !== last) originals.set(node, current);
  const original = originals.get(node) ?? current;
  const next = translateVi(original);
  translated.set(node, next);
  if (current !== next) node.data = next;
}

function localizeTree(root: Node, language: Language) {
  if (root.nodeType === Node.TEXT_NODE) return localizeText(root as Text, language);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) localizeText(node as Text, language);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(loadLanguage);
  const setLanguage = (next: Language) => { setLanguageState(next); try { localStorage.setItem("hts.language", next); } catch { /* storage is optional */ } };
  const value = useMemo(() => ({ language, setLanguage }), [language]);
  useEffect(() => {
    document.documentElement.lang = language;
    const root = document.getElementById("root");
    if (!root) return;
    localizeTree(root, language);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") localizeText(record.target as Text, language);
        for (const added of record.addedNodes) localizeTree(added, language);
      }
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}

export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  return <div className="global-language-switch" aria-label={language === "vi" ? "Ngôn ngữ" : "Language"}>
    <button type="button" lang="en" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
    <button type="button" lang="vi" aria-pressed={language === "vi"} onClick={() => setLanguage("vi")}>VI</button>
  </div>;
}
