// Joins the recorded clips into one 1920x1080 draft with scene titles. Needs ffmpeg on PATH.
// Desktop clips (1280x720) are scaled up; phone clips (390x844) are centred on a paper-coloured frame.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLIPS, OUT } from "./recorder.mjs";

const TITLES = [
  ["01a-citizen-phone", "Citizen: report without an account or a name", true],
  ["01b-check-rumour", "Citizen: check a rumour against approved answers", false],
  ["01c-phone-simulator", "SMS and USSD on a simulator (test numbers)", false],
  ["02-observer-phone", "Observer: works offline, sends itself on reconnect", true],
  ["03-reviewer", "Reviewer: AI suggests, a person decides", false],
  ["04a-coordinator", "Coordinator: surges and check-ins", false],
  ["04b-second-coordinator", "A safety notice needs a second coordinator", false],
  ["05a-result-sheet-phone", "Observer types the result sheet", true],
  ["05b-result-sheet-reviewer", "Flag for review. This is not a result.", false],
  ["05c-publish-and-results", "Public results: reviewed only, small numbers hidden", false],
  ["06-privacy-languages", "Five languages. Synthetic data only. Prototype.", true],
];
const font = "C:/Windows/Fonts/arialbd.ttf";
const tmp = join(OUT, "joined-parts");
mkdirSync(tmp, { recursive: true });
const parts = [];
for (const [name, title, phone] of TITLES) {
  const input = join(CLIPS, `${name}.webm`);
  if (!existsSync(input)) { console.log("missing", name); continue; }
  const out = join(tmp, `${name}.mp4`);
  const text = title.replaceAll(":", "\:").replaceAll("'", "");
  const draw = `drawbox=x=0:y=ih-110:w=iw:h=110:color=0x0f0e0c@0.82:t=fill,drawtext=fontfile='${font.replace(":", "\:")}':text='${text}':fontcolor=white:fontsize=44:x=60:y=h-78`;
  const filter = phone
    ? `[0:v]scale=-2:1000[p];color=c=0xf6f1e4:s=1920x1080:r=25[bg];[bg][p]overlay=(W-w)/2:20,${draw}`
    : `[0:v]scale=1920:1080:flags=lanczos,${draw}`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", input, "-filter_complex", filter, "-r", "25", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-an", out]);
  parts.push(out);
  console.log("encoded", name);
}
writeFileSync(join(tmp, "list.txt"), parts.map((p) => `file '${p.replaceAll("\\", "/")}'`).join("\n"));
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(tmp, "list.txt"), "-c", "copy", join(OUT, "draft-demo.mp4")]);
console.log("wrote", join(OUT, "draft-demo.mp4"));
