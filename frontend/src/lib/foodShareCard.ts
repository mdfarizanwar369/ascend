export const FOOD_SHARE_WIDTH = 1080;
export const FOOD_SHARE_HEIGHT = 1350;

export type FoodShareCardData = {
  foodName: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  imageUrl: string | null;
};

const LOGO_URL = "/brand/ascend-mark-exact.png";
const WHITE = "#f8fafc";
const MUTED = "#b8c5d6";
const TEAL = "#35f2d0";

function loadImage(url: string, errorMessage: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(errorMessage));
    image.src = url;
  });
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawFittedText(context: CanvasRenderingContext2D, value: string, x: number, y: number, maxWidth: number, maxSize: number, minSize: number, weight = 700) {
  let size = maxSize;
  do {
    context.font = `${weight} ${size}px Arial, sans-serif`;
    if (context.measureText(value).width <= maxWidth || size === minSize) break;
    size -= 2;
  } while (size >= minSize);
  let text = value;
  if (context.measureText(text).width > maxWidth) {
    while (text.length > 1 && context.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
    text = `${text.trimEnd()}…`;
  }
  context.fillText(text, x, y);
}

function drawMealTitle(context: CanvasRenderingContext2D, name: string) {
  const words = name.toLocaleUpperCase().split(/\s+/).filter(Boolean);
  const maxWidth = 910;
  for (let size = 86; size >= 52; size -= 2) {
    context.font = `700 ${size}px Arial, sans-serif`;
    const lines: string[] = [];
    for (const word of words) {
      const line = lines.length - 1;
      const candidate = line >= 0 ? `${lines[line]} ${word}` : word;
      if (line >= 0 && context.measureText(candidate).width <= maxWidth) lines[line] = candidate;
      else lines.push(word);
    }
    if (lines.length > 2 || lines.some((line) => context.measureText(line).width > maxWidth)) continue;
    const firstBaseline = lines.length === 1 ? 826 : 747;
    lines.forEach((line, index) => context.fillText(line, 82, firstBaseline + index * 79));
    return;
  }
  drawFittedText(context, words.join(" "), 82, 826, maxWidth, 52, 52);
}

function drawBackground(context: CanvasRenderingContext2D) {
  const background = context.createLinearGradient(0, 0, FOOD_SHARE_WIDTH, FOOD_SHARE_HEIGHT);
  background.addColorStop(0, "#130d27");
  background.addColorStop(0.46, "#081321");
  background.addColorStop(1, "#06252c");
  context.fillStyle = background;
  context.fillRect(0, 0, FOOD_SHARE_WIDTH, FOOD_SHARE_HEIGHT);

  const violetGlow = context.createRadialGradient(85, 85, 0, 85, 85, 620);
  violetGlow.addColorStop(0, "rgba(132,63,245,0.27)");
  violetGlow.addColorStop(1, "rgba(132,63,245,0)");
  context.fillStyle = violetGlow;
  context.fillRect(0, 0, FOOD_SHARE_WIDTH, FOOD_SHARE_HEIGHT);

  const tealGlow = context.createRadialGradient(1000, 1120, 0, 1000, 1120, 540);
  tealGlow.addColorStop(0, "rgba(20,224,205,0.19)");
  tealGlow.addColorStop(1, "rgba(20,224,205,0)");
  context.fillStyle = tealGlow;
  context.fillRect(0, 600, FOOD_SHARE_WIDTH, 750);
}

function drawBrand(context: CanvasRenderingContext2D, logo: HTMLImageElement) {
  const logoHeight = 58;
  context.drawImage(logo, 58, 58, logoHeight * logo.width / logo.height, logoHeight);
  context.fillStyle = WHITE;
  context.font = "700 37px Arial, sans-serif";
  context.fillText("ASCEND", 142, 101);
  context.fillStyle = TEAL;
  context.font = "700 21px Arial, sans-serif";
  context.textAlign = "right";
  context.fillText("MY FOOD SNAP", 1024, 95);
  context.textAlign = "left";
}

function drawPhoto(context: CanvasRenderingContext2D, image: HTMLImageElement | null, foodName: string) {
  const x = 50;
  const y = 153;
  const width = 980;
  const height = 730;
  context.save();
  roundedRect(context, x, y, width, height, 35);
  context.clip();

  if (image) {
    drawCover(context, image, x, y, width, height);
    const shade = context.createLinearGradient(0, y, 0, y + height);
    shade.addColorStop(0, "rgba(4,10,20,0.08)");
    shade.addColorStop(0.56, "rgba(4,10,20,0.05)");
    shade.addColorStop(1, "rgba(4,10,20,0.9)");
    context.fillStyle = shade;
    context.fillRect(x, y, width, height);
  } else {
    const fallback = context.createLinearGradient(x, y, x + width, y + height);
    fallback.addColorStop(0, "#23143f");
    fallback.addColorStop(1, "#06444a");
    context.fillStyle = fallback;
    context.fillRect(x, y, width, height);
    context.strokeStyle = "rgba(255,255,255,0.08)";
    context.lineWidth = 2;
    for (let offset = -height; offset < width; offset += 66) {
      context.beginPath();
      context.moveTo(x + offset, y);
      context.lineTo(x + offset + height, y + height);
      context.stroke();
    }
  }

  context.fillStyle = WHITE;
  context.shadowColor = "rgba(0,0,0,0.55)";
  context.shadowBlur = 20;
  drawMealTitle(context, foodName);
  context.shadowBlur = 0;
  context.restore();

  const frame = context.createLinearGradient(x, y, x + width, y + height);
  frame.addColorStop(0, "rgba(165,116,255,0.7)");
  frame.addColorStop(0.5, "rgba(255,255,255,0.16)");
  frame.addColorStop(1, "rgba(53,242,208,0.72)");
  context.strokeStyle = frame;
  context.lineWidth = 2;
  roundedRect(context, x, y, width, height, 35);
  context.stroke();
}

function drawNutrition(context: CanvasRenderingContext2D, data: FoodShareCardData) {
  const calories = Math.round(data.calories).toLocaleString("en-US");
  context.fillStyle = TEAL;
  context.font = "700 23px Arial, sans-serif";
  context.fillText("CALORIE ESTIMATE", 70, 952);

  context.fillStyle = WHITE;
  drawFittedText(context, calories, 62, 1110, 695, 152, 78);
  const calorieWidth = context.measureText(calories).width;
  context.fillStyle = MUTED;
  context.font = "600 44px Arial, sans-serif";
  context.fillText("kcal", Math.min(785, 62 + calorieWidth + 18), 1104);

  const line = context.createLinearGradient(70, 0, 1010, 0);
  line.addColorStop(0, "#9658e9");
  line.addColorStop(1, TEAL);
  context.fillStyle = line;
  context.fillRect(70, 1145, 940, 3);

  const metrics = [
    { label: "PROTEIN", value: data.proteinG },
    { label: "CARBS", value: data.carbsG },
    { label: "FAT", value: data.fatG }
  ];
  for (let index = 0; index < metrics.length; index += 1) {
    const center = 70 + (index + 0.5) * (940 / 3);
    context.textAlign = "center";
    context.fillStyle = MUTED;
    context.font = "700 22px Arial, sans-serif";
    context.fillText(metrics[index].label, center, 1200);
    context.fillStyle = WHITE;
    context.font = "700 43px Arial, sans-serif";
    const value = metrics[index].value;
    context.fillText(Number.isFinite(value) && value >= 0 ? `${Math.round(value)}g` : "—", center, 1251, 270);
  }
  context.textAlign = "left";
  context.fillStyle = "rgba(211,223,235,0.74)";
  context.font = "500 20px Arial, sans-serif";
  context.textAlign = "center";
  context.fillText("Nutrition estimate · Portions may vary", FOOD_SHARE_WIDTH / 2, 1310);
  context.textAlign = "left";
}

export async function renderFoodShareCard(data: FoodShareCardData) {
  if (!data.foodName.trim() || !Number.isFinite(data.calories) || data.calories <= 0) {
    throw new Error("Add a food name and calories before sharing.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = FOOD_SHARE_WIDTH;
  canvas.height = FOOD_SHARE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This device could not create the meal card.");

  const [logo, photo] = await Promise.all([
    loadImage(LOGO_URL, "Could not load Ascend branding."),
    data.imageUrl ? loadImage(data.imageUrl, "Could not prepare this meal photo. Please try again.") : Promise.resolve(null)
  ]);

  drawBackground(context);
  drawBrand(context, logo);
  drawPhoto(context, photo, data.foodName.trim());
  drawNutrition(context, data);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create the meal card.")), "image/png");
  });
}
