import jsPDF from "jspdf";

const COMPLETION_MARKER = "===BRAND_DNA_COMPLETE===";

async function loadLogoAsDataURL(): Promise<string> {
  const res = await fetch("/logo.png");
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

export async function downloadBrandDNA(content: string) {
  const clean = content.replace(COMPLETION_MARKER, "").trim();

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginLeft = 20;
  const contentWidth = pageWidth - marginLeft - 20;
  let y = 0;

  const bgColor: [number, number, number] = [252, 249, 245];

  function addBackground() {
    pdf.setFillColor(...bgColor);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
  }

  function checkPage(needed: number) {
    if (y + needed > pageHeight - 20) {
      pdf.addPage();
      addBackground();
      y = 25;
    }
  }

  addBackground();

  try {
    const logoData = await loadLogoAsDataURL();
    const logoW = 50;
    const logoH = 50 * (441 / 750);
    const logoX = (pageWidth - logoW) / 2;
    pdf.addImage(logoData, "PNG", logoX, 20, logoW, logoH);
    y = 20 + logoH + 8;
  } catch {
    y = 25;
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.setTextColor(6, 38, 78);
  const titleText = "Your Brand DNA";
  const titleWidth = pdf.getTextWidth(titleText);
  pdf.text(titleText, (pageWidth - titleWidth) / 2, y);
  y += 6;

  pdf.setDrawColor(192, 137, 103);
  pdf.setLineWidth(0.5);
  pdf.line(pageWidth / 2 - 30, y, pageWidth / 2 + 30, y);
  y += 15;

  function renderRichLine(text: string, x: number, fontSize: number, maxWidth: number) {
    pdf.setFontSize(fontSize);
    const lineH = fontSize * 0.5 + 1;

    const parts = text.split(/(\*\*.*?\*\*)/g);
    const segments: { text: string; bold: boolean }[] = [];
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith("**") && part.endsWith("**")) {
        segments.push({ text: part.slice(2, -2), bold: true });
      } else {
        segments.push({ text: part.replace(/\*(.*?)\*/g, "$1"), bold: false });
      }
    }

    const words: { word: string; bold: boolean }[] = [];
    for (const seg of segments) {
      const segWords = seg.text.split(/( +)/);
      for (const w of segWords) {
        if (w) words.push({ word: w, bold: seg.bold });
      }
    }

    let lineWords: { word: string; bold: boolean }[] = [];
    let lineWidth = 0;

    const flushLine = () => {
      if (lineWords.length === 0) return;
      checkPage(lineH);
      let lx = x;
      for (const w of lineWords) {
        pdf.setFont("helvetica", w.bold ? "bold" : "normal");
        pdf.setFontSize(fontSize);
        pdf.text(w.word, lx, y);
        lx += pdf.getTextWidth(w.word);
      }
      y += lineH;
      lineWords = [];
      lineWidth = 0;
    };

    for (const w of words) {
      pdf.setFont("helvetica", w.bold ? "bold" : "normal");
      pdf.setFontSize(fontSize);
      const wWidth = pdf.getTextWidth(w.word);
      if (lineWidth + wWidth > maxWidth && lineWords.length > 0) {
        flushLine();
      }
      lineWords.push(w);
      lineWidth += wWidth;
    }
    flushLine();

    pdf.setFont("helvetica", "normal");
  }

  const lines = clean.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("# ")) {
      checkPage(18);
      y += 6;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.setTextColor(6, 38, 78);
      const headingText = trimmed.slice(2).replace(/\*\*(.*?)\*\*/g, "$1");
      const headingLines = pdf.splitTextToSize(headingText, contentWidth);
      for (const hl of headingLines) {
        checkPage(10);
        pdf.text(hl, marginLeft, y);
        y += 9;
      }
      pdf.setDrawColor(192, 137, 103);
      pdf.setLineWidth(0.3);
      pdf.line(marginLeft, y - 3, marginLeft + contentWidth, y - 3);
      y += 4;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      checkPage(14);
      y += 5;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(6, 38, 78);
      const headingText = trimmed.slice(3).replace(/\*\*(.*?)\*\*/g, "$1");
      const headingLines = pdf.splitTextToSize(headingText, contentWidth);
      for (const hl of headingLines) {
        checkPage(8);
        pdf.text(hl, marginLeft, y);
        y += 7;
      }
      y += 2;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      checkPage(12);
      y += 3;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.setTextColor(6, 38, 78);
      const headingText = trimmed.slice(4).replace(/\*\*(.*?)\*\*/g, "$1");
      const headingLines = pdf.splitTextToSize(headingText, contentWidth);
      for (const hl of headingLines) {
        checkPage(7);
        pdf.text(hl, marginLeft, y);
        y += 6;
      }
      y += 1;
      continue;
    }

    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      checkPage(8);
      y += 3;
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(marginLeft, y, marginLeft + contentWidth, y);
      y += 5;
      continue;
    }

    if (!trimmed) {
      y += 3;
      continue;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
      const bulletText = trimmed.slice(2);
      pdf.setFontSize(10);
      pdf.setTextColor(40, 40, 40);
      checkPage(6);
      pdf.setTextColor(192, 137, 103);
      pdf.text("•", marginLeft + 1, y);
      pdf.setTextColor(40, 40, 40);
      renderRichLine(bulletText, marginLeft + 7, 10, contentWidth - 8);
      y += 1;
      continue;
    }

    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numberedMatch) {
      const num = numberedMatch[1];
      const text = numberedMatch[2];
      pdf.setFontSize(10);
      pdf.setTextColor(40, 40, 40);
      checkPage(6);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(192, 137, 103);
      pdf.text(`${num}.`, marginLeft + 1, y);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(40, 40, 40);
      renderRichLine(text, marginLeft + 10, 10, contentWidth - 10);
      y += 1;
      continue;
    }

    pdf.setTextColor(40, 40, 40);
    renderRichLine(trimmed, marginLeft, 10, contentWidth);
    y += 2;
  }

  pdf.save("Your_Brand_DNA.pdf");
}
