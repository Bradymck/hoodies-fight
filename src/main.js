import { loadFighterData } from "./api.js";
import { Fighter } from "./fighter.js";
import { createGame } from "./game.js";

const startBtn = document.getElementById("start-btn");
const setupStatus = document.getElementById("setup-status");

startBtn.addEventListener("click", async () => {
  const id1 = document.getElementById("p1-id").value;
  const id2 = document.getElementById("p2-id").value;

  startBtn.disabled = true;
  setupStatus.textContent = "Loading Hoodies...";

  try {
    const [data1, data2] = await Promise.all([
      loadFighterData(id1),
      loadFighterData(id2),
    ]);

    document.getElementById("setup").classList.add("hidden");
    document.getElementById("arena").classList.remove("hidden");
    document.getElementById("p1-name").textContent = data1.name;
    document.getElementById("p2-name").textContent = data2.name;

    showTaunt("taunt-p1", data1.taunt);
    showTaunt("taunt-p2", data2.taunt);

    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    const p1 = new Fighter(data1, 200, 1);
    const p2 = new Fighter(data2, 600, -1);

    setTimeout(() => {
      document.getElementById("taunt-p1").classList.add("hidden");
      document.getElementById("taunt-p2").classList.add("hidden");
      createGame({ ctx, canvas, p1, p2 });
    }, 2500);
  } catch (err) {
    setupStatus.textContent = err.message;
    startBtn.disabled = false;
  }
});

function showTaunt(elId, text) {
  const el = document.getElementById(elId);
  if (!text) return;
  el.textContent = `"${text}"`;
  el.classList.remove("hidden");
}
