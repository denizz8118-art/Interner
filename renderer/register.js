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

  const payload = {
    id: String(Date.now()),
    ad_soyad: fullName,
    email,
    sifre: password,
    rol: "STAJYER",
    departman: "Genel",
    sirketUnvan: "Stajyer",
    telefon: "***"
  };

  try {
    const createResult = await window.api.createUser(payload);
    if (!createResult?.ok) {
      errorText.textContent = createResult?.error || "Kayıt sırasında hata oluştu.";
      return;
    }
    if (createResult?.path) console.log("[register:createUser] saved", { path: createResult.path, count: createResult.count });
  } catch (error) {
    errorText.textContent = error?.message || "Kayıt sırasında bağlantı hatası oluştu.";
    return;
  }

  localStorage.setItem("currentUser", JSON.stringify(payload));
  window.location.href = "./app.html";
});
