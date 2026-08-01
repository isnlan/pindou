import type { PaletteColor, PaletteId } from "../../shared/types/project";

const legacyPalette: PaletteColor[] = [
  { id: "W01", name: "亮白", hex: "#F7F4ED", rgb: [247, 244, 237] },
  { id: "W02", name: "奶油白", hex: "#F1E3C8", rgb: [241, 227, 200] },
  { id: "W03", name: "米杏", hex: "#E7D0AE", rgb: [231, 208, 174] },
  { id: "Y01", name: "浅柠黄", hex: "#F5E57A", rgb: [245, 229, 122] },
  { id: "Y02", name: "向日黄", hex: "#F2C14E", rgb: [242, 193, 78] },
  { id: "Y03", name: "芥末黄", hex: "#D7A628", rgb: [215, 166, 40] },
  { id: "O01", name: "浅橙", hex: "#F2B277", rgb: [242, 178, 119] },
  { id: "O02", name: "南瓜橙", hex: "#E58A3C", rgb: [229, 138, 60] },
  { id: "O03", name: "陶土橙", hex: "#C96A2B", rgb: [201, 106, 43] },
  { id: "R01", name: "珊瑚粉", hex: "#F09A93", rgb: [240, 154, 147] },
  { id: "R02", name: "莓果粉", hex: "#E56D7A", rgb: [229, 109, 122] },
  { id: "R03", name: "正红", hex: "#E04B41", rgb: [224, 75, 65] },
  { id: "R04", name: "砖红", hex: "#B94A43", rgb: [185, 74, 67] },
  { id: "P01", name: "浅粉", hex: "#F4C8D8", rgb: [244, 200, 216] },
  { id: "P02", name: "玫瑰粉", hex: "#DA8DAA", rgb: [218, 141, 170] },
  { id: "P03", name: "豆沙粉", hex: "#BC718C", rgb: [188, 113, 140] },
  { id: "V01", name: "雾紫", hex: "#C8B7DB", rgb: [200, 183, 219] },
  { id: "V02", name: "薰衣草紫", hex: "#A490C5", rgb: [164, 144, 197] },
  { id: "V03", name: "深莓紫", hex: "#7D659A", rgb: [125, 101, 154] },
  { id: "B01", name: "冰蓝", hex: "#CDE7F4", rgb: [205, 231, 244] },
  { id: "B02", name: "天青蓝", hex: "#8EC9E8", rgb: [142, 201, 232] },
  { id: "B03", name: "湖蓝", hex: "#5CA9D6", rgb: [92, 169, 214] },
  { id: "B04", name: "钴蓝", hex: "#3F79B5", rgb: [63, 121, 181] },
  { id: "B05", name: "夜蓝", hex: "#284A73", rgb: [40, 74, 115] },
  { id: "T01", name: "薄荷绿", hex: "#C8EFE7", rgb: [200, 239, 231] },
  { id: "T02", name: "浅湖绿", hex: "#84D6C7", rgb: [132, 214, 199] },
  { id: "T03", name: "孔雀绿", hex: "#4AA3A1", rgb: [74, 163, 161] },
  { id: "T04", name: "深湖绿", hex: "#2F8F83", rgb: [47, 143, 131] },
  { id: "G01", name: "嫩芽绿", hex: "#CFE59A", rgb: [207, 229, 154] },
  { id: "G02", name: "苹果绿", hex: "#9CCB65", rgb: [156, 203, 101] },
  { id: "G03", name: "草地绿", hex: "#6FA44B", rgb: [111, 164, 75] },
  { id: "G04", name: "森林绿", hex: "#4F7A3B", rgb: [79, 122, 59] },
  { id: "N01", name: "沙米", hex: "#D9C2A4", rgb: [217, 194, 164] },
  { id: "N02", name: "焦糖棕", hex: "#B98257", rgb: [185, 130, 87] },
  { id: "N03", name: "胡桃棕", hex: "#8E5E4C", rgb: [142, 94, 76] },
  { id: "N04", name: "深木棕", hex: "#684636", rgb: [104, 70, 54] },
  { id: "N05", name: "咖啡棕", hex: "#4E352B", rgb: [78, 53, 43] },
  { id: "S01", name: "浅暖灰", hex: "#DDD6CB", rgb: [221, 214, 203] },
  { id: "S02", name: "暖灰", hex: "#B7AEA1", rgb: [183, 174, 161] },
  { id: "S03", name: "石墨灰", hex: "#8C847A", rgb: [140, 132, 122] },
  { id: "S04", name: "深灰", hex: "#615A52", rgb: [97, 90, 82] },
  { id: "K01", name: "炭黑", hex: "#2C2925", rgb: [44, 41, 37] },
];

const photoPalette: PaletteColor[] = [
  { id: "B06", name: "云雾蓝", hex: "#D5DEEB", rgb: [213, 222, 235] },
  { id: "B07", name: "冷灰蓝", hex: "#B8C5D8", rgb: [184, 197, 216] },
  { id: "B08", name: "钢蓝灰", hex: "#8FA2BD", rgb: [143, 162, 189] },
  { id: "S05", name: "中性浅灰", hex: "#C9CDD2", rgb: [201, 205, 210] },
  { id: "N06", name: "浅肤杏", hex: "#E2B49C", rgb: [226, 180, 156] },
  { id: "N07", name: "柔肤棕", hex: "#C68E79", rgb: [198, 142, 121] },
  { id: "N08", name: "自然肤棕", hex: "#AD786B", rgb: [173, 120, 107] },
];

// Keep legacy colors first so saved cell indices remain stable.
export const defaultPalette: PaletteColor[] = [...legacyPalette, ...photoPalette];

const MARD_221_DATA = `B3=#9EF780,C3=#A0E2FB,D9=#D5B9F8,E2=#FEC0DF,G1=#FFE2CE,A4=#FBED56,B5=#35E352,C5=#01ACEB,D6=#AC7BDE,E4=#E8649E,G5=#EDB045,A6=#FEAC4C,B8=#1C9C4F,C8=#0F54C0,D7=#8854B3,F5=#E7002F,G7=#9D5B3E,A7=#FE8B4C,H1=#FDFBFF,H2=#FEFFFF,H3=#B6B1BA,H4=#89858C,H5=#48464E,H7=#000000,C2=#A9F9FC,C13=#CDE8FF,D19=#D8C3D7,E8=#FFDBE9,A13=#FFC365,A11=#FFDD99,C10=#3EBCE2,C6=#50AAF0,D18=#A45EC7,E3=#FFB7E7,A10=#F77C31,G9=#E6B483,C11=#28DDDE,C7=#3677D2,D21=#9A009B,D13=#B90095,F13=#F35744,G13=#B7714A,B12=#166F41,D3=#2F54AF,D15=#2F1F90,E7=#C63478,F8=#BC0028,G8=#753832,A3=#FEFF8B,B20=#C2F0CC,D16=#E3E1EE,D8=#E2D3FF,E1=#FDD3CC,G2=#FFC4AA,B18=#E6EE49,B10=#95D3C2,D11=#B9BAE1,D12=#DE9AD4,E12=#F78FC3,G3=#F4C3A5,B14=#ADE946,B19=#24B88C,D2=#858EDD,D20=#9C32B2,E5=#F551A2,F10=#8A4526,B17=#9BB13A,B7=#3DAF80,C16=#1557A8,D14=#8B279B,E13=#B5006D,F7=#971937,E11=#FCDDD2,E14=#FFD1BA,F1=#FD957B,A14=#FD543D,M6=#B0A782,M5=#D0CCAA,E15=#F8C7C9,F14=#FFA9AD,F9=#E2677A,F2=#FC3D46,G14=#8D614C,M9=#A58767,E9=#E970CC,E6=#F13D74,F12=#FD4E6A,F3=#F74941,F11=#5A2121,M12=#644749,D5=#B843C5,E10=#D33793,F4=#FC283C,F6=#943630,G17=#78524B,H6=#2F2B2F,A15=#FFF365,A5=#F4D738,A8=#FFDA45,A12=#FE9F72,A9=#FF995B,G6=#E99C17,A1=#FAF4C8,B13=#CAEB7B,B1=#E6EE31,B2=#63F347,B4=#5DE035,B11=#5D722A,H12=#FFF5ED,C1=#E8FFE7,B16=#C5ED9C,B6=#65E2A6,C15=#22C4C6,B15=#2E5132,C14=#D5FDFF,D17=#C4D4F6,D1=#AEB4F2,C4=#41CCFF,C17=#04D1F6,C9=#324BCA,H8=#E7D6DB,G15=#FCF9E0,A2=#FFFFD5,H13=#F5ECD2,G16=#F2D9BA,H9=#EDEDED,H10=#EEE9EA,M1=#BCC6B8,G11=#E0C593,G4=#E1B383,M4=#E3D2BC,H14=#CFD7D3,M10=#C5B2BC,M2=#8AA386,G12=#FFC890,M13=#D19066,M7=#B4A497,H11=#CECDD5,M11=#9F7594,M3=#697D80,G10=#D98C39,M14=#C77362,M8=#B38281,M15=#757D78,H17=#F1EDED,H18=#FFFDF0,H19=#F6EFE2,E16=#FFF3EB,F16=#FEC2A6,F17=#E69C79,D23=#EBDAFC,E24=#E1BCE8,E19=#FEBAD5,E18=#FFC7DB,E17=#FFE2EA,E20=#D8C7D1,B24=#EEFCA5,A16=#FFFF9F,A17=#FFE36E,A18=#FEBE7D,F24=#E698AA,F23=#F67E66,A24=#F7F8A2,A22=#F4F57D,A21=#FFE395,F21=#F7B4C6,F22=#FDC0D0,A19=#FD7C72,A26=#FFC830,A25=#FFD67D,A20=#FFD568,A23=#E6C9B7,G18=#FFE4CC,H21=#FFFBE1,B26=#8D7A35,B32=#9CAB5A,B31=#B0E792,B30=#E2FCB1,B27=#CCE1AF,B29=#C5E254,C22=#67B4BE,C23=#C8E2FF,C24=#7CC4FF,B28=#9EE5B9,C25=#A9E5E5,C27=#D3DFFA,H15=#98A6A8,H20=#949FA3,H23=#9A9D94,H22=#CACAD4,C28=#BBCFED,C21=#BEDDFF,F15=#D30022,F19=#C1444A,G20=#A94023,E21=#BD9DA1,E22=#B785A1,D26=#DFC2F8,F25=#E54B4F,F20=#CD9391,G19=#E07935,F18=#D37C46,G21=#B88558,E23=#937A8D,D25=#494FC7,D22=#333A95,D24=#7786E5,C20=#176DAF,B21=#156A6B,B25=#4E846D,H16=#1D1414,B23=#303A21,C18=#1D3344,B22=#0B3C43,C19=#1887A2,C26=#3CAED8,C29=#34488E,D10=#361851,B9=#27523A,C12=#1C334D,D4=#182A84`;

export const mard221Palette: PaletteColor[] = MARD_221_DATA.split(",").map((entry) => {
  const [id, hex] = entry.split("=");
  return { id, name: "MARD", hex, rgb: hexToRgb(hex), brand: "MARD", code: id, series: id[0] };
});

export const paletteDefinitions: Record<PaletteId, { id: PaletteId; label: string; brand: string; colors: PaletteColor[] }> = {
  "mard-221": { id: "mard-221", label: "MARD 221 色库", brand: "MARD", colors: mard221Palette },
  "generic-49": { id: "generic-49", label: "通用 49 色库", brand: "通用", colors: defaultPalette },
};

export const DEFAULT_PALETTE_ID: PaletteId = "mard-221";

export function normalizePaletteId(value: unknown, fallback: PaletteId = DEFAULT_PALETTE_ID): PaletteId {
  return value === "mard-221" || value === "generic-49" ? value : fallback;
}

export function getPaletteDefinition(paletteId: PaletteId) {
  return paletteDefinitions[paletteId] ?? paletteDefinitions[DEFAULT_PALETTE_ID];
}

export function getPalette(paletteId: PaletteId) {
  return getPaletteDefinition(paletteId).colors;
}

export function getPaletteIds(paletteId: PaletteId) {
  return getPalette(paletteId).map((color) => color.id);
}

export const defaultPaletteIds = defaultPalette.map((color) => color.id);

export function normalizeEnabledPaletteIds(enabledPaletteIds?: string[], paletteId: PaletteId = "generic-49") {
  const palette = getPalette(paletteId);
  const paletteIds = palette.map((color) => color.id);
  if (!enabledPaletteIds || enabledPaletteIds.length === 0) {
    return paletteIds;
  }

  const validIds = new Set(paletteIds);
  const deduped = enabledPaletteIds.filter((id, index) => {
    return validIds.has(id) && enabledPaletteIds.indexOf(id) === index;
  });

  const hasEveryLegacyColor = paletteId === "generic-49" &&
    deduped.length === legacyPalette.length &&
    legacyPalette.every((color) => deduped.includes(color.id));

  if (hasEveryLegacyColor) {
    return [...defaultPaletteIds];
  }

  return deduped.length > 0 ? deduped : paletteIds;
}

export function findPaletteIndexById(colorId: string, paletteId: PaletteId = "generic-49") {
  return getPalette(paletteId).findIndex((item) => item.id === colorId);
}

export function findPaletteColorById(colorId: string, paletteId: PaletteId = "generic-49") {
  const palette = getPalette(paletteId);
  return palette.find((item) => item.id === colorId) ?? palette[0];
}

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
}
