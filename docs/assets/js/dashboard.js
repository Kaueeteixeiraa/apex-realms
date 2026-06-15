const joinRoomModal = document.querySelector("#join-room");
const joinRoomForm = document.querySelector("#join-room-form");
const roomCodeInput = document.querySelector("#room-code");
const roomCodeFeedback = document.querySelector("#join-room-feedback");

document.addEventListener("keydown", event => {
  if (event.key === "Escape") joinRoomModal?.classList.remove("open");
});

roomCodeInput?.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  roomCodeFeedback.textContent = "";
});

joinRoomForm?.addEventListener("submit", event => {
  event.preventDefault();
  if (!joinRoomForm.reportValidity()) return;
  roomCodeFeedback.textContent = "Código validado. Abrindo a sala...";
  roomCodeFeedback.classList.add("success");
  setTimeout(() => { window.location.href = "demo.html"; }, 550);
});
