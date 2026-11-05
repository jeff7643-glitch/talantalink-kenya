export const stadiumTierColors: Record<string, string> = {
  lower: "#08a99f",
  middle: "#df263c",
  upper: "#d82438",
};

export const stadiumCategoryLabels: Record<string, string> = {
  general: "General",
  pwd: "Accessible",
  skybox: "Skybox",
  vip: "VIP",
  vvip: "VVIP",
  presidential: "Presidential",
  media: "Media",
};

export function getStadiumTierColor(tier: string) {
  return stadiumTierColors[tier] ?? "#778087";
}

export function getStadiumCategoryLabel(category: string) {
  return (
    stadiumCategoryLabels[category] ??
    category
      .split(/[_\s-]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}
