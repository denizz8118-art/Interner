let users = [];
let selectedRole = "ALL";
let searchText = "";

const roleLabelMap = {
  MANAGER: "Manager",
  LEADER: "Leader",
  ADMIN: "Admin",
  STAJYER: "Stajyer"
};

const roleClassMap = {
  MANAGER: "badge-manager",
  LEADER: "badge-leader",
  ADMIN: "badge-admin",
  STAJYER: "badge-stajyer"
};

const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");
const roleTabs = document.getElementById("roleTabs");
const searchInput = document.getElementById("searchInput");
const tableBody = document.getElementById("userTableBody");
const openModalBtn = document.getElementById("openModalBtn");
const userModal = document.getElementById("userModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelModalBtn = document.getElementById("cancelModalBtn");
const userForm = document.getElementById("userForm");
const fullNameInput = document.getElementById("fullName");
const newEmailInput = document.getElementById("newEmail");
const newPasswordInput = document.getElementById("newPassword");
const departmentSelect = document.getElementById("departmentSelect");
const roleSelect = document.getElementById("roleSelect");
const modalError = document.getElementById("modalError");
const toggleNewPassword = document.getElementById("toggleNewPassword");
const deptName = document.getElementById("deptName");
const miniAvatar = document.getElementById("miniAvatar");
const miniUserName = document.getElementById("miniUserName");
const logoutBtn = document.getElementById("logoutBtn");
const currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");

// Kullanıcının oturumunu kontrol eder, giriş yoksa login ekranına döner.
function guardManagerRoute() {
  if (!currentUser) {
    window.location.href = "./login.html";
  }
}

// Departman verisini okuyup select alanını doldurur.
async function loadDepartments() {
  let departments = [];
  try {
    departments = await window.api.listDepartments();
  } catch (error) {
    departments = [];
  }

  departmentSelect.innerHTML = '<option value="">Seçiniz</option>';
  const values = departments.length ? departments : ["Yönetim"];
  values.forEach((department) => {
    const option = document.createElement("option");
    option.value = department;
    option.textContent = department;
    departmentSelect.appendChild(option);
  });
}

// Verilen ad-soyad metninden iki karakterlik baş harf üretir.
function createInitials(text) {
  const parts = text.trim().split(" ").filter(Boolean);
  if (parts.length === 0) {
    return "??";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

// Aktif role ve arama metnine göre kullanıcıları filtreler.
function getFilteredUsers() {
  return users.filter((user) => {
    const fullName = `${user.ad} ${user.soyad}`.toLowerCase();
    const byRole = selectedRole === "ALL" || user.rol === selectedRole;
    const bySearch =
      fullName.includes(searchText) || user.email.toLowerCase().includes(searchText);
    return byRole && bySearch;
  });
}

// Kullanıcı tablosunu güncel filtreye göre yeniden çizer.
function renderTable() {
  const list = getFilteredUsers();
  tableBody.innerHTML = "";

  if (!list.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="5" class="empty-row">Kullanıcı bulunamadı.</td>';
    tableBody.appendChild(row);
    return;
  }

  list.forEach((user, index) => {
    const row = document.createElement("tr");
    const fullName = `${user.ad} ${user.soyad}`;
    const colors = ["#7C3AED", "#2563EB", "#EA580C", "#16A34A", "#DB2777"];
    const avatarColor = colors[index % colors.length];
    row.innerHTML = `
      <td>
        <div class="name-cell">
          <span class="avatar" style="background:${avatarColor}">${createInitials(fullName)}</span>
          <strong>${fullName}</strong>
        </div>
      </td>
      <td class="muted">${user.email}</td>
      <td>${user.departman || "-"}</td>
      <td><span class="role-badge ${roleClassMap[user.rol] || "badge-manager"}">${roleLabelMap[user.rol] || user.rol}</span></td>
      <td>
        <div class="actions">
          <button class="action-btn edit" type="button">✏</button>
          <button class="action-btn delete" type="button" data-id="${user.id}">🗑</button>
        </div>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

// Sidebar'ı daraltıp genişleterek ikon odaklı görünümü yönetir.
function toggleSidebar() {
  sidebar.classList.toggle("collapsed");
}

// Yeni kullanıcı modalını görünür yapar.
function openModal() {
  userModal.classList.remove("hidden");
}

// Modalı kapatır ve formu başlangıç durumuna alır.
function closeModal() {
  userModal.classList.add("hidden");
  modalError.textContent = "";
  userForm.reset();
  newPasswordInput.type = "password";
}

// Ekleme formunda zorunlu alan ve tekil e-posta doğrulaması yapar.
function validateNewUser(fullName, email, password, department, role) {
  if (!fullName || !email || !password || !department || !role) {
    return "Tüm alanlar zorunludur.";
  }
  const exists = users.some((user) => user.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    return "Bu e-posta zaten kayıtlı.";
  }
  return "";
}

// Ad-soyad metnini ad ve soyad parçalarına ayırır.
function parseName(fullName) {
  const pieces = fullName.trim().split(" ").filter(Boolean);
  const ad = pieces.shift() || "";
  const soyad = pieces.join(" ") || "-";
  return { ad, soyad };
}

// Formdan gelen bilgilerle kullanıcı ekler ve tabloyu yeniler.
async function onSubmitNewUser(event) {
  event.preventDefault();
  modalError.textContent = "";

  const fullName = fullNameInput.value.trim();
  const email = newEmailInput.value.trim();
  const password = newPasswordInput.value.trim();
  const department = departmentSelect.value;
  const role = roleSelect.value;

  const validation = validateNewUser(fullName, email, password, department, role);
  if (validation) {
    modalError.textContent = validation;
    return;
  }

  const { ad, soyad } = parseName(fullName);
  const newUser = {
    id: String(Date.now()),
    ad,
    soyad,
    email,
    sifre: password,
    rol: role,
    departman: department,
    sirketUnvan: role,
    profilFoto: null
  };

  try {
    const result = await window.api.addUser(newUser);
    if (!result?.ok) {
      modalError.textContent = result?.error || "Kullanıcı eklenemedi.";
      return;
    }
    users.push(newUser);
    renderTable();
    closeModal();
  } catch (error) {
    modalError.textContent = "Kullanıcı eklenemedi.";
  }
}

// Verilen kullanıcı id'sini onay sonrası listeden siler.
async function deleteUser(userId) {
  if (!window.confirm("Bu kullanıcıyı silmek istediğinize emin misiniz?")) {
    return;
  }
  try {
    const result = await window.api.deleteUser(userId);
    if (!result?.ok) {
      return;
    }
    users = users.filter((user) => user.id !== userId);
    renderTable();
  } catch (error) {
    return;
  }
}

// Sidebar altındaki kullanıcı kartını aktif kullanıcıdan üretir.
function renderCurrentUserCard() {
  if (!currentUser) {
    return;
  }
  deptName.textContent = currentUser.departman || "Yönetim";
  miniUserName.textContent = `${currentUser.ad} ${currentUser.soyad}`;
  miniAvatar.textContent = createInitials(`${currentUser.ad} ${currentUser.soyad}`);
}

// Tüm UI olaylarını bağlar ve etkileşimleri aktifleştirir.
function bindEvents() {
  sidebarToggle.addEventListener("click", toggleSidebar);
  openModalBtn.addEventListener("click", openModal);
  closeModalBtn.addEventListener("click", closeModal);
  cancelModalBtn.addEventListener("click", closeModal);
  userForm.addEventListener("submit", onSubmitNewUser);

  roleTabs.addEventListener("click", (event) => {
    const tab = event.target.closest(".tab-btn");
    if (!tab) {
      return;
    }
    selectedRole = tab.dataset.role;
    document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
    tab.classList.add("active");
    renderTable();
  });

  searchInput.addEventListener("input", (event) => {
    searchText = event.target.value.trim().toLowerCase();
    renderTable();
  });

  tableBody.addEventListener("click", (event) => {
    const deleteBtn = event.target.closest(".delete");
    if (deleteBtn) {
      deleteUser(deleteBtn.dataset.id);
    }
  });

  userModal.addEventListener("click", (event) => {
    if (event.target === userModal) {
      closeModal();
    }
  });

  toggleNewPassword.addEventListener("click", () => {
    const hidden = newPasswordInput.type === "password";
    newPasswordInput.type = hidden ? "text" : "password";
  });

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("currentUser");
    window.location.href = "./login.html";
  });
}

// Sayfa açılışındaki güvenlik, veri yükleme ve ilk render akışını başlatır.
async function init() {
  guardManagerRoute();
  try {
    users = await window.api.listUsers();
  } catch (error) {
    users = [];
  }
  await loadDepartments();
  renderCurrentUserCard();
  renderTable();
  bindEvents();
}

init();
