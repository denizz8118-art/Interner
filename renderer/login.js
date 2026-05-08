const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorText = document.getElementById("errorText");
const togglePassword = document.getElementById("togglePassword");

togglePassword.addEventListener("click", () => {
  passwordInput.type = passwordInput.type === "password" ? "text" : "password";
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorText.textContent = "";

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  try {
    const result = await window.api.login(email, password);
    if (!result?.ok) {
      errorText.textContent = result?.error || "Giriş sırasında hata oluştu.";
      return;
    }

    localStorage.setItem("currentUser", JSON.stringify(result.user));
    window.location.href = "./app.html";
  } catch (error) {
    errorText.textContent = "Giriş sırasında hata oluştu.";
  }
});
