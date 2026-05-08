const registerForm = document.getElementById("registerForm");
const errorText = document.getElementById("registerError");

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorText.textContent = "";

  const fullName = document.getElementById("fullName").value.trim();
  const email = document.getElementById("regEmail").value.trim().toLowerCase();
  const password = document.getElementById("regPassword").value;
  const passwordRepeat = document.getElementById("regPasswordRepeat").value;
  const termsAccepted = document.getElementById("termsAccepted").checked;

  if (!fullName || !email || !password || !passwordRepeat) {
    errorText.textContent = "Tüm alanlar zorunludur.";
    return;
  }
  if (password !== passwordRepeat) {
    errorText.textContent = "Şifreler eşleşmiyor.";
    return;
  }
  if (!termsAccepted) {
    errorText.textContent = "Kullanım koşullarını kabul etmeden kayıt olamazsınız.";
    return;
  }

  const chunks = fullName.split(" ").filter(Boolean);
  const ad = chunks.shift() || "";
  const soyad = chunks.join(" ") || "-";

  const payload = {
    id: String(Date.now()),
    ad,
    soyad,
    email,
    sifre: password,
    rol: "STAJYER",
    departman: "Genel",
    sirketUnvan: "Stajyer",
    profilFoto: null
  };

  const result = await window.api.register(payload);
  if (!result?.ok) {
    errorText.textContent = result?.error || "Kayıt sırasında hata oluştu.";
    return;
  }

  localStorage.setItem("currentUser", JSON.stringify(payload));
  window.location.href = "./app.html";
});
