const STORAGE_KEY = "educamais_crm_data";
const REMEMBER_LOGIN_KEY = "edukie_auth_remember";
const authStorage = {
  getItem(key) {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  },
  setItem(key, value) {
    const rememberLogin = localStorage.getItem(REMEMBER_LOGIN_KEY) !== "false";
    const selectedStorage = rememberLogin ? localStorage : sessionStorage;
    const otherStorage = rememberLogin ? sessionStorage : localStorage;
    selectedStorage.setItem(key, value);
    otherStorage.removeItem(key);
  },
  removeItem(key) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};
const supabaseClient = window.supabase?.createClient(
  window.SUPABASE_CONFIG?.url,
  window.SUPABASE_CONFIG?.publishableKey,
  {
    auth: {
      persistSession: true,
      storage: authStorage,
    },
  }
);
let cloudUser = null;
let cloudReady = false;
let cloudUserRole = null;
const ADMIN_EMAILS = [];
const USER_ALLOWED_VIEWS = ["courses", "clients", "partners", "admin"];
const VIEW_LABELS = {
  overview: "Visão geral",
  courses: "Cursos",
  sales: "Vendas",
  clients: "Clientes",
  partners: "Parceiros",
  costs: "Financeiro",
  marketing: "Marketing",
  admin: "Administração",
};

const ROLE_CACHE_KEY = "edukie_user_role";

function isAdmin() {
  return cloudUserRole === "admin";
}

function getCachedRole() {
  try {
    const raw = sessionStorage.getItem(ROLE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function setCachedRole(role) {
  try { sessionStorage.setItem(ROLE_CACHE_KEY, JSON.stringify(role)); } catch (_) {}
}

function clearCachedRole() {
  try { sessionStorage.removeItem(ROLE_CACHE_KEY); } catch (_) {}
}

async function loadUserRole() {
  if (!cloudUser || !supabaseClient) return;
  const cached = getCachedRole();
  if (cached) {
    cloudUserRole = cached;
    return;
  }
  try {
    const { data, error } = await supabaseClient
      .from("user_profiles")
      .select("role")
      .eq("id", cloudUser.id)
      .maybeSingle();
    if (data) {
      cloudUserRole = data.role;
    } else {
      const isAdminEmail = ADMIN_EMAILS.includes(cloudUser.email);
      let hasNoAdmin = false;
      try {
        const { data: adminCount, error: countError } = await supabaseClient.rpc("get_admin_count");
        if (!countError) hasNoAdmin = adminCount === 0 || adminCount === null;
        else hasNoAdmin = false; // se a funcao nao existe, safe default: assume que ja existe admin
      } catch (_) { hasNoAdmin = false; }
      const role = isAdminEmail || hasNoAdmin ? "admin" : "user";
      const { error: upsertError } = await supabaseClient
        .from("user_profiles")
        .upsert({ id: cloudUser.id, email: cloudUser.email, role }, { onConflict: "id" });
      if (upsertError) {
        console.error("Erro ao criar perfil de usuario:", upsertError);
        const { data: retry } = await supabaseClient
          .from("user_profiles")
          .select("role")
          .eq("id", cloudUser.id)
          .maybeSingle();
        cloudUserRole = retry?.role || "user";
      } else {
        cloudUserRole = role;
      }
    }
    setCachedRole(cloudUserRole);
  } catch (err) {
    console.error("Erro ao carregar permissao:", err);
    cloudUserRole = "user";
  }
}
let cloudSaveTimer = null;
let cloudSavePromise = null;
let cloudSaveRequested = false;
let cloudLoadPromise = null;
let partnerSaveInProgress = false;
let saleSaveInProgress = false;
const DEFAULT_CONTRACT_TEXT = `CONTRATO DE PARCERIA EDUCACIONAL

PARTES:
CONTRATANTE: [NOME / RAZAO SOCIAL]
CONTRATADA: [NOME DA FACULDADE / PARCERIA]

OBJETO:
O presente contrato estabelece as condicoes da parceria para comercializacao dos cursos oferecidos pela CONTRATADA.

INFORMACOES NECESSARIAS:
- Dados completos das partes e responsaveis;
- Cursos contemplados pela parceria;
- Valores de custo, repasse e venda;
- Forma e prazo de pagamento;
- Prazo de entrega dos documentos e diplomas;
- Responsabilidades de atendimento ao aluno;
- Regras de cancelamento e reembolso;
- Vigencia, renovacao e encerramento;
- Assinaturas das partes.

CONDICOES ESPECIFICAS:
[PREENCHER]

DATA E ASSINATURAS:
[PREENCHER]`;

const COURSE_TYPE_GROUPS = [
  {
    type: "EJA",
    description: "Ensino medio e fundamental",
    modalities: ["Ensino medio", "Ensino fundamental"],
  },
  {
    type: "Cursos Livres",
    description: "Cursos livres",
    modalities: ["Cursos livres"],
  },
  {
    type: "Cursos Técnicos",
    description: "Cursos tecnicos",
    modalities: ["Tecnico"],
  },
  {
    type: "Especializações",
    description: "Tecnologo e sequencial superior",
    modalities: ["Tecnologo", "Sequencial superior"],
  },
  {
    type: "Graduações",
    description: "Bacharel, licenciatura e formacao pedagogica",
    modalities: ["Bacharel", "Licenciatura", "Formacao pedagogica"],
  },
  {
    type: "Nível Master",
    description: "Pos-graduacao, mestrado e doutorado",
    modalities: ["Pos-graduacao", "Mestrado", "Doutorado"],
  },
  {
    type: "Cursos Detran",
    description: "Detran",
    modalities: ["Detran"],
  },
];

const ALL_COURSE_MODALITIES = [...new Set(COURSE_TYPE_GROUPS.flatMap((group) => group.modalities))];

function canonicalCourseText(value) {
  const text = normalize(value);
  return text
    .replace(/\bpos\b/g, "pos")
    .replace(/\btecnico\b/g, "tecnico")
    .replace(/\btecnologo\b/g, "tecnologo");
}

function getCourseTypeFromModality(modality) {
  const normalizedModality = canonicalCourseText(modality);
  if (["ensino medio", "ensino fundamental", "eja"].includes(normalizedModality)) return "EJA";
  if (["curso livre", "cursos livres", "livre"].includes(normalizedModality)) return "Cursos Livres";
  if (["tecnico"].includes(normalizedModality)) return "Cursos Técnicos";
  if (["tecnologo", "sequencial", "sequencial superior"].includes(normalizedModality)) return "Especializações";
  if (["bacharel", "licenciatura", "formacao pedagogica", "graduacao", "segunda licenciatura"].includes(normalizedModality)) {
    return "Graduações";
  }
  if (["pos graduacao", "pos-graduacao", "mestrado", "doutorado"].includes(normalizedModality)) return "Nível Master";
  if (["detran"].includes(normalizedModality)) return "Cursos Detran";
  return "Cursos Livres";
}

function getCourseTypeGroup(type) {
  return COURSE_TYPE_GROUPS.find((group) => normalize(group.type) === normalize(type));
}

function getCourseTypeValue(course) {
  return course?.type || getCourseTypeFromModality(course?.modality);
}

function isSameCourseModality(left, right) {
  const normalizedLeft = canonicalCourseText(left);
  const normalizedRight = canonicalCourseText(right);
  if (normalizedLeft === normalizedRight) return true;

  const aliases = [
    ["livre", "curso livre", "cursos livres"],
    ["eja", "ensino medio", "ensino fundamental"],
  ];

  return aliases.some((group) => group.includes(normalizedLeft) && group.includes(normalizedRight));
}

const seedData = {
  partners: [
    {
      id: "p1",
      name: "Faculdade Horizonte",
      type: "Faculdade",
      city: "Sao Paulo/SP",
      contact: "Marina - comercial",
      siteUrl: "https://example.com",
      mecUrl: "",
      contractFileName: "",
      contractDataUrl: "",
      catalogFileName: "",
      catalogDataUrl: "",
      catalogs: [],
      documents: [],
      contractText: DEFAULT_CONTRACT_TEXT,
    },
    {
      id: "p2",
      name: "Instituto Saber Mais",
      type: "Escola tecnica",
      city: "Campinas/SP",
      contact: "WhatsApp da secretaria",
      siteUrl: "",
      mecUrl: "",
      contractFileName: "",
      contractDataUrl: "",
      catalogFileName: "",
      catalogDataUrl: "",
      catalogs: [],
      documents: [],
      contractText: DEFAULT_CONTRACT_TEXT,
    },
    {
      id: "p3",
      name: "Universidade Polo Norte",
      type: "Polo EAD",
      city: "Online",
      contact: "Portal de parceiros",
      siteUrl: "",
      mecUrl: "",
      contractFileName: "",
      contractDataUrl: "",
      catalogFileName: "",
      catalogDataUrl: "",
      catalogs: [],
      documents: [],
      contractText: DEFAULT_CONTRACT_TEXT,
    },
  ],
  courses: [
    {
      id: "c1",
      partnerId: "p1",
      name: "Pedagogia",
      modality: "Graduacao",
      area: "Educacao",
      cost: 189.9,
      sale: 249.9,
      transfer: "",
      deadline: "35 dias",
      responsible: "",
      diplomas: "",
      examFileName: "",
      examDataUrl: "",
      notes: "Mensalidade promocional.",
    },
    {
      id: "c2",
      partnerId: "p1",
      name: "Administracao",
      modality: "Graduacao",
      area: "Gestao",
      cost: 210,
      sale: 289.9,
      transfer: "",
      deadline: "35 dias",
      responsible: "",
      diplomas: "",
      examFileName: "",
      examDataUrl: "",
      notes: "",
    },
    {
      id: "c3",
      partnerId: "p2",
      name: "Tecnico em Enfermagem",
      modality: "Tecnico",
      area: "Saude",
      cost: 320,
      sale: 429,
      transfer: "",
      deadline: "35 dias",
      responsible: "",
      diplomas: "",
      examFileName: "",
      examDataUrl: "",
      notes: "Verificar turma antes de vender.",
    },
    {
      id: "c4",
      partnerId: "p3",
      name: "Psicopedagogia",
      modality: "Pos-graduacao",
      area: "Educacao",
      cost: 99.9,
      sale: 159.9,
      transfer: "",
      deadline: "35 dias",
      responsible: "",
      diplomas: "",
      examFileName: "",
      examDataUrl: "",
      notes: "Curso EAD.",
    },
  ],
  sales: [
    {
      id: "s1",
      courseId: "c3",
      date: "2026-06-08",
      student: "Alan Gabriel Karnopp",
      status: "Fechado",
      seller: "Jonata",
      payment: "Cartao",
      quantity: "4x",
      cost: 450,
      price: 1041.56,
      commission: 0,
    },
  ],
  expenses: [
    {
      id: "e1",
      date: "2026-06-08",
      type: "Marketing semanal",
      description: "Campanha de exemplo",
      amount: 0,
      notes: "",
    },
    {
      id: "e2",
      date: "2026-06-08",
      type: "ChatGPT",
      description: "Assinatura ChatGPT",
      amount: 0,
      notes: "",
    },
  ],
};

const state = {
  data: loadData(),
  mainView: "overview",
  selectedPartnerId: "all",
  courseSearch: "",
  courseType: "",
  modality: "",
  courseSort: "name-asc",
  salesSearch: "",
  salesStatus: "",
  salesDateFrom: "",
  salesDateTo: "",
  salesMonth: "",
  salesSeller: "",
  salesPayment: "",
  salesPartnerId: "",
  clientSearch: "",
  salesCourseId: "",
  expenseSearch: "",
  expenseType: "",
  marketingSearch: "",
  marketingCategory: "",
  summaryMonth: today().slice(0, 7),
  coursePage: 1,
  coursePerPage: 10,
  partnerPage: 1,
  partnerPerPage: 10,
  clientPage: 1,
  clientPerPage: 10,
};

const els = {
  loadingScreen: document.querySelector("#loadingScreen"),
  loginScreen: document.querySelector("#loginScreen"),
  loginForm: document.querySelector("#loginForm"),
  loginEmail: document.querySelector("#loginEmail"),
  loginPassword: document.querySelector("#loginPassword"),
  rememberLogin: document.querySelector("#rememberLogin"),
  loginMessage: document.querySelector("#loginMessage"),
  syncStatus: document.querySelector("#syncStatus"),
  logoutBtn: document.querySelector("#logoutBtn"),
  partnerCount: document.querySelector("#partnerCount"),
  courseCount: document.querySelector("#courseCount"),
  salesCount: document.querySelector("#salesCount"),
  totalProfit: document.querySelector("#totalProfit"),
  summaryGrid: document.querySelector("#summaryGrid"),
  coursesView: document.querySelector("#coursesView"),
  partnersView: document.querySelector("#partnersView"),
  salesView: document.querySelector("#salesView"),
  courseSearch: document.querySelector("#courseSearch"),
  courseSort: document.querySelector("#courseSort"),
  courseRows: document.querySelector("#courseRows"),
  courseCards: document.querySelector("#courseCards"),
  emptyState: document.querySelector("#emptyState"),
  selectedPartner: document.querySelector("#selectedPartner"),
  mainTabs: document.querySelectorAll("[data-main-view]"),
  addCourseBtn: document.querySelector("#addCourseBtn"),
  addPartnerBtnQuick: document.querySelector("#addPartnerBtnQuick"),
  addPartnerBtnMobile: document.querySelector("#addPartnerBtnMobile"),
  partnerDialog: document.querySelector("#partnerDialog"),
  partnerForm: document.querySelector("#partnerForm"),
  partnerDialogTitle: document.querySelector("#partnerDialogTitle"),
  partnerId: document.querySelector("#partnerId"),
  partnerName: document.querySelector("#partnerName"),
  partnerType: document.querySelector("#partnerType"),
  partnerCity: document.querySelector("#partnerCity"),
  partnerContact: document.querySelector("#partnerContact"),
  partnerNotes: document.querySelector("#partnerNotes"),
  partnerSite: document.querySelector("#partnerSite"),
  partnerMecUrl: document.querySelector("#partnerMecUrl"),
  partnerContract: document.querySelector("#partnerContract"),
  partnerContractStatus: document.querySelector("#partnerContractStatus"),
  removePartnerContract: document.querySelector("#removePartnerContract"),
  partnerCatalog: document.querySelector("#partnerCatalog"),
  partnerCatalogStatus: document.querySelector("#partnerCatalogStatus"),
  partnerDocuments: document.querySelector("#partnerDocuments"),
  partnerEditCatalogsList: document.querySelector("#partnerEditCatalogsList"),
  partnerEditDocumentsList: document.querySelector("#partnerEditDocumentsList"),
  partnerFormMessage: document.querySelector("#partnerFormMessage"),
  deletePartner: document.querySelector("#deletePartner"),
  courseDialog: document.querySelector("#courseDialog"),
  courseForm: document.querySelector("#courseForm"),
  courseDialogTitle: document.querySelector("#courseDialogTitle"),
  courseId: document.querySelector("#courseId"),
  coursePartner: document.querySelector("#coursePartner"),
  courseName: document.querySelector("#courseName"),
  courseType: document.querySelector("#courseType"),
  courseModality: document.querySelector("#courseModality"),
  courseCost: document.querySelector("#courseCost"),
  courseSale: document.querySelector("#courseSale"),
  courseTransfer: document.querySelector("#courseTransfer"),
  courseDeadline: document.querySelector("#courseDeadline"),
  courseResponsible: document.querySelector("#courseResponsible"),
  courseDiplomas: document.querySelector("#courseDiplomas"),
  courseExamFile: document.querySelector("#courseExamFile"),
  courseExamStatus: document.querySelector("#courseExamStatus"),
  removeCourseExam: document.querySelector("#removeCourseExam"),
  courseNotes: document.querySelector("#courseNotes"),
  deleteCourse: document.querySelector("#deleteCourse"),
  salesSearch: document.querySelector("#salesSearch"),
  salesStatusFilter: document.querySelector("#salesStatusFilter"),
  salesDateFrom: document.querySelector("#salesDateFrom"),
  salesDateTo: document.querySelector("#salesDateTo"),
  salesMonth: document.querySelector("#salesMonth"),
  salesSellerFilter: document.querySelector("#salesSellerFilter"),
  salesPaymentFilter: document.querySelector("#salesPaymentFilter"),
  salesPartnerFilter: document.querySelector("#salesPartnerFilter"),
  salesCourseFilter: document.querySelector("#salesCourseFilter"),
  clearSalesFiltersBtn: document.querySelector("#clearSalesFiltersBtn"),
  salesRows: document.querySelector("#salesRows"),
  salesEmptyState: document.querySelector("#salesEmptyState"),
  salesCostTotal: document.querySelector("#salesCostTotal"),
  salesRevenueTotal: document.querySelector("#salesRevenueTotal"),
  salesProfitTotal: document.querySelector("#salesProfitTotal"),
  salesCommissionTotal: document.querySelector("#salesCommissionTotal"),
  salesFinalProfitTotal: document.querySelector("#salesFinalProfitTotal"),
  addSaleBtn: document.querySelector("#addSaleBtn"),
  saleDialog: document.querySelector("#saleDialog"),
  saleForm: document.querySelector("#saleForm"),
  saleDialogTitle: document.querySelector("#saleDialogTitle"),
  saleId: document.querySelector("#saleId"),
  saleCourseSearch: document.querySelector("#saleCourseSearch"),
  saleCourse: document.querySelector("#saleCourse"),
  saleDate: document.querySelector("#saleDate"),
  saleStudent: document.querySelector("#saleStudent"),
  saleStatus: document.querySelector("#saleStatus"),
  saleSeller: document.querySelector("#saleSeller"),
  salePayment: document.querySelector("#salePayment"),
  saleQuantity: document.querySelector("#saleQuantity"),
  saleCost: document.querySelector("#saleCost"),
  salePrice: document.querySelector("#salePrice"),
  saleCommissionPercent: document.querySelector("#saleCommissionPercent"),
  saleCommission: document.querySelector("#saleCommission"),
  saleFormMessage: document.querySelector("#saleFormMessage"),
  deleteSale: document.querySelector("#deleteSale"),
  saveSale: document.querySelector("#saveSale"),
  costsView: document.querySelector("#costsView"),
  expensesTotal: document.querySelector("#expensesTotal"),
  commissionsTotal: document.querySelector("#commissionsTotal"),
  netProfitTotal: document.querySelector("#netProfitTotal"),
  expenseSearch: document.querySelector("#expenseSearch"),
  expenseTypeFilter: document.querySelector("#expenseTypeFilter"),
  expenseRows: document.querySelector("#expenseRows"),
  expensesEmptyState: document.querySelector("#expensesEmptyState"),
  addExpenseBtn: document.querySelector("#addExpenseBtn"),
  expenseDialog: document.querySelector("#expenseDialog"),
  expenseForm: document.querySelector("#expenseForm"),
  expenseDialogTitle: document.querySelector("#expenseDialogTitle"),
  expenseId: document.querySelector("#expenseId"),
  expenseDate: document.querySelector("#expenseDate"),
  expenseType: document.querySelector("#expenseType"),
  expenseDescription: document.querySelector("#expenseDescription"),
  expenseAmount: document.querySelector("#expenseAmount"),
  expenseNotes: document.querySelector("#expenseNotes"),
  deleteExpense: document.querySelector("#deleteExpense"),
  clientsView: document.querySelector("#clientsView"),
  marketingView: document.querySelector("#marketingView"),
  clientRows: document.querySelector("#clientRows"),
  clientCards: document.querySelector("#clientCards"),
  clientSearch: document.querySelector("#clientSearch"),
  emptyClientState: document.querySelector("#emptyClientState"),
  clientDialog: document.querySelector("#clientDialog"),
  clientForm: document.querySelector("#clientForm"),
  clientDialogTitle: document.querySelector("#clientDialogTitle"),
  clientId: document.querySelector("#clientId"),
  clientName: document.querySelector("#clientName"),
  clientCourse: document.querySelector("#clientCourse"),
  clientPartner: document.querySelector("#clientPartner"),
  clientCpf: document.querySelector("#clientCpf"),
  clientPhone: document.querySelector("#clientPhone"),
  clientEmail: document.querySelector("#clientEmail"),
  clientContractFile: document.querySelector("#clientContractFile"),
  clientHistoryFile: document.querySelector("#clientHistoryFile"),
  clientDeclarationFile: document.querySelector("#clientDeclarationFile"),
  clientDiplomaFile: document.querySelector("#clientDiplomaFile"),
  saveClient: document.querySelector("#saveClient"),
  deleteClient: document.querySelector("#deleteClient"),
  addClientBtn: document.querySelector("#addClientBtn"),
  addMarketingBtn: document.querySelector("#addMarketingBtn"),
  marketingSearch: document.querySelector("#marketingSearch"),
  marketingCategoryFilter: document.querySelector("#marketingCategoryFilter"),
  marketingList: document.querySelector("#marketingList"),
  marketingDialog: document.querySelector("#marketingDialog"),
  marketingForm: document.querySelector("#marketingForm"),
  marketingCategory: document.querySelector("#marketingCategory"),
  marketingDescription: document.querySelector("#marketingDescription"),
  marketingFiles: document.querySelector("#marketingFiles"),
  profileButton: document.querySelector("#profileButton"),
  sidebarUserAvatar: document.querySelector("#sidebarUserAvatar"),
  sidebarUserName: document.querySelector("#sidebarUserName"),
  profileDialog: document.querySelector("#profileDialog"),
  profileForm: document.querySelector("#profileForm"),
  profileName: document.querySelector("#profileName"),
  profilePhotoUrl: document.querySelector("#profilePhotoUrl"),
  profilePhotoFile: document.querySelector("#profilePhotoFile"),
  profilePreviewAvatar: document.querySelector("#profilePreviewAvatar"),
  profilePreviewName: document.querySelector("#profilePreviewName"),
};

function getNameFromEmail(email) {
  const baseName = String(email || "").split("@")[0].replace(/[._-]+/g, " ").trim();
  if (!baseName) return "Usuario";
  return baseName.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getAuthProfile() {
  const metadata = cloudUser?.user_metadata || {};
  const email = cloudUser?.email || metadata.email || "";
  return {
    displayName:
      metadata.full_name ||
      metadata.name ||
      metadata.display_name ||
      metadata.preferred_username ||
      getNameFromEmail(email),
    avatarUrl: metadata.avatar_url || metadata.picture || "",
  };
}

function getEffectiveProfile() {
  const authProfile = getAuthProfile();
  const savedProfile = state.data.profile || {};
  return {
    displayName: savedProfile.displayName || authProfile.displayName,
    avatarUrl: savedProfile.avatarUrl || authProfile.avatarUrl,
  };
}

function getInitials(name) {
  const parts = String(name || "Usuario")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2);
  return (initials || "US").toUpperCase();
}

function renderAvatar(target, profile) {
  target.textContent = "";
  if (profile.avatarUrl) {
    const image = document.createElement("img");
    image.src = profile.avatarUrl;
    image.alt = `Foto de ${profile.displayName}`;
    image.referrerPolicy = "no-referrer";
    image.onerror = () => {
      image.remove();
      target.textContent = getInitials(profile.displayName);
    };
    target.appendChild(image);
    return;
  }
  target.textContent = getInitials(profile.displayName);
}

function getRoleLabel() {
  return isAdmin() ? "Administrador" : "Usuário";
}

function renderProfile() {
  const profile = getEffectiveProfile();
  els.sidebarUserName.textContent = profile.displayName;
  renderAvatar(els.sidebarUserAvatar, profile);

  const sidebarRoleLabel = document.querySelector(".sidebar-user span:not(.sidebar-user-avatar)");
  if (sidebarRoleLabel) sidebarRoleLabel.textContent = getRoleLabel();

  if (els.profileDialog.open) {
    els.profilePreviewName.textContent = profile.displayName;
    renderAvatar(els.profilePreviewAvatar, profile);
    const dialogRoleLabel = document.querySelector("#profileDialog .profile-preview div span");
    if (dialogRoleLabel) dialogRoleLabel.textContent = getRoleLabel();
  }
}

function openProfileDialog() {
  const profile = getEffectiveProfile();
  els.profileName.value = profile.displayName;
  els.profilePhotoUrl.value = state.data.profile?.avatarUrl || "";
  els.profilePhotoFile.value = "";
  els.profilePreviewName.textContent = profile.displayName;
  renderAvatar(els.profilePreviewAvatar, profile);
  const dialogRoleLabel = document.querySelector("#profileDialog .profile-preview div span");
  if (dialogRoleLabel) dialogRoleLabel.textContent = getRoleLabel();
  const adminBtn = document.querySelector("#profileAdminPanelBtn");
  if (adminBtn) adminBtn.style.display = isAdmin() ? "" : "none";
  els.profileDialog.showModal();
}

async function openAdminPanel() {
  const listEl = document.querySelector("#adminUserList");
  const dialog = document.querySelector("#adminPanelDialog");
  if (!listEl || !dialog) return;
  listEl.innerHTML = '<div class="empty-state">Carregando usuários...</div>';
  const msgEl = document.querySelector("#adminNewUserMessage");
  if (msgEl) msgEl.textContent = "";
  const emailEl = document.querySelector("#adminNewUserEmail");
  if (emailEl) emailEl.value = "";
  const passEl = document.querySelector("#adminNewUserPassword");
  if (passEl) passEl.value = "";
  dialog.showModal();
  await renderAdminUserList();
}

async function renderAdminUserList() {
  const listEl = document.querySelector("#adminUserList");
  if (!listEl) return;
  try {
    const { data, error } = await supabaseClient
      .from("user_profiles")
      .select("id, email, role, created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    if (!data || !data.length) {
      listEl.innerHTML = '<div class="empty-state">Nenhum usuário encontrado.</div>';
      return;
    }
    const currentUserId = cloudUser?.id;
    const adminCount = data.filter((u) => u.role === "admin").length;
    listEl.innerHTML = `
      <div class="admin-user-section-head admin-mobile-only">
        <strong>Usuários atuais</strong>
        <span>${data.length}</span>
      </div>
      <div class="admin-user-card-stack" style="display:grid;gap:8px;">
      ${data.map((u) => {
        const isSelf = u.id === currentUserId;
        const isLastAdmin = u.role === "admin" && adminCount <= 1;
        let actionHtml = `<span class="admin-self-badge" style="font-size:0.85em;opacity:0.5;">${isSelf ? "Você" : ""}</span>`;
        if (!isSelf) {
          const toggleLabel = u.role === "admin" ? "Revogar admin" : "Tornar admin";
          const toggleDisabled = isLastAdmin ? "disabled" : "";
          const removeDisabled = isLastAdmin ? "disabled" : "";
          actionHtml = `<div class="admin-user-actions" style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="secondary-action admin-promote-action" type="button" style="padding:4px 12px;font-size:0.85rem;" ${toggleDisabled} data-admin-toggle-role="${u.id}" data-admin-toggle-current="${u.role}">
              ${toggleLabel}
            </button>
            <button class="danger-action admin-remove-action" type="button" style="padding:4px 12px;font-size:0.85rem;" ${removeDisabled} data-admin-remove-user="${u.id}" data-admin-remove-email="${escapeHtml(u.email)}">
              Remover
            </button>
          </div>`;
        }
        return `
        <div class="admin-user-card" style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--border-color,#ddd);border-radius:8px;background:var(--card-bg,#fff);">
          <span class="admin-user-avatar admin-mobile-only" aria-hidden="true">${escapeHtml((u.email || "US").slice(0, 2).toUpperCase())}</span>
          <div class="admin-user-info">
            <strong>${escapeHtml(u.email)}</strong>
            <br/>
            <span style="font-size:0.85em;opacity:0.7;text-transform:capitalize;">${u.role}</span>
          </div>
          ${actionHtml}
        </div>`;
      }).join("")}
    </div>`;
    listEl.querySelectorAll("[data-admin-toggle-role]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const userId = btn.dataset.adminToggleRole;
        const currentRole = btn.dataset.adminToggleCurrent;
        const newRole = currentRole === "admin" ? "user" : "admin";
        btn.disabled = true;
        btn.textContent = "Alterando...";
        const { error: updateError } = await supabaseClient
          .from("user_profiles")
          .update({ role: newRole })
          .eq("id", userId);
        if (updateError) {
          alert("Erro ao alterar permissão: " + updateError.message);
        }
        await renderAdminUserList();
      });
    });

    listEl.querySelectorAll("[data-admin-remove-user]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (btn.disabled) return;
        const userId = btn.dataset.adminRemoveUser;
        const email = btn.dataset.adminRemoveEmail;
        if (!confirm(`Remover usuário ${email}?\n\nIsso apaga COMPLETAMENTE o usuário do sistema (auth + dados).`)) return;
        btn.disabled = true;
        btn.textContent = "Removendo...";
        const { error: rpcError } = await supabaseClient.rpc("admin_delete_user", { target_id: userId });
        if (rpcError) {
          alert("Erro ao remover usuário: " + rpcError.message);
          await renderAdminUserList();
          return;
        }
        try { await supabaseClient.from("crm_state").delete().eq("user_id", userId); } catch (_) {}
        await renderAdminUserList();
      });
    });
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state">Erro ao carregar: ${escapeHtml(err.message)}</div>`;
  }
}

document.querySelector("#adminCreateUserBtn")?.addEventListener("click", async () => {
  const emailEl = document.querySelector("#adminNewUserEmail");
  const passEl = document.querySelector("#adminNewUserPassword");
  const msgEl = document.querySelector("#adminNewUserMessage");
  const email = emailEl?.value?.trim();
  const password = passEl?.value;
  if (!email || !password) {
    if (msgEl) msgEl.textContent = "Preencha e-mail e senha do novo usuário.";
    return;
  }
  if (password.length < 6) {
    if (msgEl) msgEl.textContent = "A senha deve ter no mínimo 6 caracteres.";
    return;
  }
  try {
    if (msgEl) msgEl.textContent = "Criando usuário...";
    const tempClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey, { auth: { persistSession: false } });
    const { error } = await tempClient.auth.signUp({ email, password });
    if (error) throw error;
    if (msgEl) msgEl.textContent = "Usuário criado! Ele já pode fazer login.";
    if (emailEl) emailEl.value = "";
    if (passEl) passEl.value = "";
    setTimeout(() => renderAdminUserList(), 1000);
  } catch (err) {
    if (msgEl) msgEl.textContent = "Erro: " + err.message;
  }
});

function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return normalizeData(stored ? JSON.parse(stored) : structuredClone(seedData));
  } catch (error) {
    console.warn("Nao foi possivel carregar a copia local.", error);
    return normalizeData(structuredClone(seedData));
  }
}

function normalizeData(data) {
  data.partners ||= [];
  data.courses ||= [];
  data.sales ||= [];
  data.expenses ||= [];
  data.marketing ||= [];
  data.clients ||= [];
  data.imports ||= {};
  data.profile ||= {};
  data.profile.displayName ||= "";
  data.profile.avatarUrl ||= "";
  mergeEduMaisCatalog(data);
  mergeCatedralCatalog(data);
  data.partners.forEach((partner) => {
    partner.siteUrl ||= "";
    partner.mecUrl ||= "";
    partner.notes ||= "";
    partner.contractFileName ||= "";
    partner.contractDataUrl ||= "";
    partner.catalogFileName ||= "";
    partner.catalogDataUrl ||= "";
    partner.catalogs ||= [];
    if (partner.catalogDataUrl && !partner.catalogs.length) {
      partner.catalogs.push({
        id: createId("catalog"),
        name: partner.catalogFileName || "Catalogo de precos.pdf",
        type: "application/pdf",
        dataUrl: partner.catalogDataUrl,
      });
    }
    partner.documents ||= [];
    partner.contractText ||= DEFAULT_CONTRACT_TEXT;
  });
  data.courses.forEach((course) => {
    course.type ||= getCourseTypeFromModality(course.modality);
    course.area = "";
    course.transfer ||= "";
    course.deadline ||= "";
    course.responsible ||= "";
    course.diplomas ||= "";
    course.examFileName ||= "";
    course.examDataUrl ||= "";
  });
  data.sales = removeDuplicateSales(data.sales);
  data.sales.forEach((sale) => {
    sale.commission = Number(sale.commission || 0);
  });
  return data;
}

function removeDuplicateSales(sales) {
  const seenIds = new Set();
  const recentFingerprints = new Map();

  return sales.filter((sale) => {
    if (!sale?.id || seenIds.has(sale.id)) return false;
    seenIds.add(sale.id);

    const fingerprint = [
      sale.courseId,
      sale.date,
      normalize(sale.student),
      sale.status,
      normalize(sale.seller),
      normalize(sale.payment),
      sale.quantity,
      Number(sale.cost || 0),
      Number(sale.price || 0),
      Number(sale.commission || 0),
    ].join("|");
    const createdAt = Number(String(sale.id).split("-")[1]) || 0;
    const previousCreatedAt = recentFingerprints.get(fingerprint);
    const isRecentDuplicate =
      previousCreatedAt && createdAt && Math.abs(createdAt - previousCreatedAt) < 10 * 60 * 1000;

    if (isRecentDuplicate) return false;
    recentFingerprints.set(fingerprint, createdAt);
    return true;
  });
}

function mergeEduMaisCatalog(data) {
  const imported = window.EDUCAMAIS_CATALOG_IMPORT;
  if (!imported || data.imports.educamaisCatalogV1) return;

  const importedPartner = structuredClone(imported.partner);
  const existingPartner = data.partners.find(
    (partner) => partner.id === importedPartner.id || normalize(partner.name) === normalize(importedPartner.name)
  );
  const partner = existingPartner || importedPartner;

  if (!existingPartner) {
    data.partners.push(partner);
  } else {
    existingPartner.catalogs ||= [];
    importedPartner.catalogs.forEach((catalog) => {
      if (!existingPartner.catalogs.some((item) => item.id === catalog.id)) {
        existingPartner.catalogs.push(catalog);
      }
    });
  }

  const existingCourseNames = new Set(
    data.courses
      .filter((course) => course.partnerId === partner.id)
      .map((course) => `${normalize(course.name)}|${normalize(course.modality)}`)
  );

  imported.courses.forEach((course, index) => {
    const key = `${normalize(course.name)}|${normalize(course.modality)}`;
    if (existingCourseNames.has(key)) return;
    data.courses.push({
      ...structuredClone(course),
      id: `edu-mais-course-${index + 1}`,
      partnerId: partner.id,
    });
    existingCourseNames.add(key);
  });

  data.imports.educamaisCatalogV1 = true;
}

function mergeCatedralCatalog(data) {
  const imported = window.CATEDRAL_CATALOG_IMPORT;
  if (!imported || data.imports.catedralCatalogV1) return;

  const importedPartner = structuredClone(imported.partner);
  const existingPartner = data.partners.find(
    (partner) => partner.id === importedPartner.id || normalize(partner.name) === normalize(importedPartner.name)
  );
  const partner = existingPartner || importedPartner;

  if (!existingPartner) {
    data.partners.push(partner);
  }

  const existingCourseNames = new Set(
    data.courses
      .filter((course) => course.partnerId === partner.id)
      .map((course) => `${normalize(course.name)}|${normalize(course.modality)}`)
  );

  imported.courses.forEach((course, index) => {
    const key = `${normalize(course.name)}|${normalize(course.modality)}`;
    if (existingCourseNames.has(key)) return;
    data.courses.push({
      ...structuredClone(course),
      id: `catedral-course-${index + 1}`,
      partnerId: partner.id,
    });
    existingCourseNames.add(key);
  });

  data.imports.catedralCatalogV1 = true;
}

function sanitizeForCache(data) {
  const copy = structuredClone(data);
  copy.courses?.forEach((c) => { c.examDataUrl = ""; });
  copy.partners?.forEach((p) => {
    p.contractDataUrl = "";
    p.catalogDataUrl = "";
    p.catalogs?.forEach((c) => { c.dataUrl = ""; });
    p.documents?.forEach((d) => { d.dataUrl = ""; });
  });
  copy.clients?.forEach((c) => {
    c.contractDataUrl = "";
    c.historyDataUrl = "";
    c.declarationDataUrl = "";
    c.diplomaDataUrl = "";
  });
  copy.marketing?.forEach((m) => { m.dataUrl = ""; });
  copy.profile ||= {};
  copy.profile.avatarUrl = "";
  return copy;
}

function saveData({ sync = true } = {}) {
  try {
    const cached = sanitizeForCache(state.data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch (error) {
    console.warn("Nao foi possivel atualizar a copia local.", error);
    setSyncStatus("Salvando somente online", "saving");
  }
  if (sync) scheduleCloudSave();
}

function setSyncStatus(message, status = "") {
  els.syncStatus.textContent = message === "Dados online carregados" ? "Dados online" : message;
  els.syncStatus.dataset.status = status;
}

function setAppLoading(isLoading) {
  els.loadingScreen.classList.toggle("hidden", !isLoading);
}

function setSaleFormLocked(isLocked, action = "save") {
  els.saleForm.querySelectorAll("button").forEach((button) => {
    button.disabled = isLocked;
  });
  els.saveSale.textContent = isLocked && action === "save" ? "Salvando..." : "Salvar venda";
  els.deleteSale.textContent = isLocked && action === "delete" ? "Excluindo..." : "Excluir";
}

function scheduleCloudSave() {
  if (!cloudReady || !cloudUser || !supabaseClient) return;
  clearTimeout(cloudSaveTimer);
  setSyncStatus("Salvando...", "saving");
  cloudSaveTimer = setTimeout(saveDataToCloud, 200);
}

async function saveDataToCloud() {
  if (!cloudReady || !cloudUser || !supabaseClient) {
    return { ok: false, error: "Sem conexao com o banco online. Entre novamente e tente salvar." };
  }

  cloudSaveRequested = true;
  if (cloudSavePromise) return cloudSavePromise;

  cloudSavePromise = (async () => {
    let result = { ok: true, error: "" };
    while (cloudSaveRequested) {
      cloudSaveRequested = false;
      result = await performCloudSave();
      if (!result.ok) break;
    }
    return result;
  })();

  try {
    return await cloudSavePromise;
  } finally {
    cloudSavePromise = null;
  }
}

async function performCloudSave() {
  try {
    setSyncStatus("Salvando online...", "saving");
    const payload = {
      user_id: cloudUser.id,
      data: structuredClone(state.data),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseClient.from("crm_state").upsert(payload, { onConflict: "user_id" });

    if (error) {
      console.error("Erro ao salvar no Supabase.", error);
      setSyncStatus("Erro ao salvar online", "error");
      return { ok: false, error: error.message || "O banco online recusou o salvamento." };
    }

    setSyncStatus("Salvo online", "saved");
    return { ok: true, error: "" };
  } catch (error) {
    console.error("Falha de conexao ao salvar no Supabase.", error);
    setSyncStatus("Erro ao salvar online", "error");
    return {
      ok: false,
      error: error?.message || "Nao foi possivel conectar ao banco online.",
    };
  }
}

async function loadSalesFromCloud() {
  const { data, error } = await supabaseClient
    .from("crm_sales")
    .select("data")
    .eq("user_id", cloudUser.id);

  if (error) {
    console.warn("A tabela individual de vendas ainda nao esta disponivel.", error);
    return { ok: false, error: error.message };
  }

  const rawOnlineSales = (data || []).map((row) => row.data);
  const onlineSales = removeDuplicateSales(rawOnlineSales);
  if (onlineSales.length !== rawOnlineSales.length) {
    const keptIds = new Set(onlineSales.map((sale) => sale.id));
    const duplicateIds = rawOnlineSales.filter((sale) => !keptIds.has(sale.id)).map((sale) => sale.id);
    if (duplicateIds.length) {
      const { error: cleanupError } = await supabaseClient
        .from("crm_sales")
        .delete()
        .eq("user_id", cloudUser.id)
        .in("id", duplicateIds);
      if (cleanupError) console.warn("Nao foi possivel limpar vendas duplicadas.", cleanupError);
    }
  }
  if (onlineSales.length) {
    state.data.sales = onlineSales;
    state.data.imports.salesTableV1 = true;
  } else if (!state.data.imports.salesTableV1 && state.data.sales.length) {
    const rows = state.data.sales.map((sale) => ({
      user_id: cloudUser.id,
      id: sale.id,
      data: sale,
      updated_at: new Date().toISOString(),
    }));
    const { error: migrationError } = await supabaseClient
      .from("crm_sales")
      .upsert(rows, { onConflict: "user_id,id" });
    if (migrationError) return { ok: false, error: migrationError.message };
    state.data.imports.salesTableV1 = true;
    return { ok: true, error: "", migrated: true };
  } else {
    state.data.sales = [];
  }

  return { ok: true, error: "", migrated: false };
}

async function saveSaleToCloud(sale) {
  if (!cloudReady || !cloudUser || !supabaseClient) {
    return { ok: false, error: "Sem conexao com o banco online." };
  }

  try {
    const { error } = await supabaseClient.from("crm_sales").upsert(
      {
        user_id: cloudUser.id,
        id: sale.id,
        data: structuredClone(sale),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,id" }
    );
    return error ? { ok: false, error: error.message } : { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: error?.message || "Falha de conexao ao salvar a venda." };
  }
}

async function deleteSaleFromCloud(saleId) {
  if (!cloudReady || !cloudUser || !supabaseClient) {
    return { ok: false, error: "Sem conexao com o banco online." };
  }
  try {
    const { error } = await supabaseClient
      .from("crm_sales")
      .delete()
      .eq("user_id", cloudUser.id)
      .eq("id", saleId);
    return error ? { ok: false, error: error.message } : { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: error?.message || "Falha de conexao ao excluir a venda." };
  }
}

async function loadDataFromCloud() {
  if (!cloudUser || !supabaseClient) return;
  if (cloudLoadPromise) return cloudLoadPromise;

  cloudLoadPromise = (async () => {
    setSyncStatus("Carregando dados...", "saving");
    const { data, error } = await supabaseClient
      .from("crm_state")
      .select("data")
      .eq("user_id", cloudUser.id)
      .maybeSingle();

    if (error) {
      setSyncStatus(`Erro ao carregar: ${error.message}`, "error");
      return;
    }

    if (data?.data) {
      state.data = normalizeData(data.data);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeForCache(state.data)));
      } catch (localError) {
        console.warn("A copia local esta cheia. Os dados continuarao online.", localError);
      }
    } else {
      const freshData = structuredClone(seedData);
      freshData.profile ||= {};
      freshData.profile.displayName = getNameFromEmail(cloudUser.email);
      const { error: insertError } = await supabaseClient
        .from("crm_state")
        .insert({ user_id: cloudUser.id, data: freshData });
      if (insertError) {
        setSyncStatus(`Erro ao criar dados online: ${insertError.message}`, "error");
        return;
      }
      state.data = normalizeData(freshData);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeForCache(state.data)));
      } catch (_) {}
    }

    const salesResult = await loadSalesFromCloud();
    cloudReady = true;
    if (salesResult.migrated) await saveDataToCloud();
    setSyncStatus("Dados online carregados", "saved");
    render();
  })();

  try {
    return await cloudLoadPromise;
  } catch (error) {
    console.error("Falha ao carregar dados do Supabase.", error);
    setSyncStatus(`Erro ao carregar: ${error?.message || "falha de conexao"}`, "error");
  } finally {
    cloudLoadPromise = null;
  }
}

async function initializeCloud() {
  if (!supabaseClient) {
    els.loginMessage.textContent = "Configuracao do Supabase nao encontrada.";
    setAppLoading(false);
    return;
  }

  try {
    const { data } = await supabaseClient.auth.getSession();
    cloudUser = data.session?.user || null;
    if (cloudUser) {
      const cached = getCachedRole();
      if (cached) {
        cloudUserRole = cached;
        renderProfile();
        if (!isAdmin() && state.mainView === "overview") state.mainView = "courses";
      }
      await Promise.all([loadUserRole(), loadDataFromCloud()]);
      if (!isAdmin() && state.mainView === "overview") state.mainView = "courses";
      renderProfile();
    } else {
      renderProfile();
    }
    els.loginScreen.classList.toggle("hidden", Boolean(cloudUser));
  } catch (error) {
    console.error("Falha ao iniciar o sistema.", error);
    setSyncStatus("Erro ao conectar com o banco online", "error");
  } finally {
    setAppLoading(false);
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    const nextUser = session?.user || null;
    const userChanged = nextUser?.id !== cloudUser?.id;
    cloudUser = nextUser;
    renderProfile();
    if (userChanged) {
      cloudReady = false;
      cloudUserRole = null;
      clearCachedRole();
    }
    els.loginScreen.classList.toggle("hidden", Boolean(cloudUser));
    if (cloudUser && !cloudReady) {
      setAppLoading(true);
      setTimeout(async () => {
        await Promise.all([loadUserRole(), loadDataFromCloud()]);
        if (!isAdmin() && state.mainView === "overview") state.mainView = "courses";
        renderProfile();
        setAppLoading(false);
      }, 0);
    } else if (!cloudUser) {
      setAppLoading(false);
    }
  });
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function shiftMonth(monthValue, amount) {
  const [year, month] = monthValue.split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  return date.toISOString().slice(0, 7);
}

function formatMonthLabel(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("Nenhum arquivo fornecido"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => {
      console.error("Erro ao ler arquivo:", error);
      reject(new Error(`Falha ao ler arquivo: ${file.name}`));
    };
    reader.onabort = () => reject(new Error("Leitura cancelada"));
    reader.readAsDataURL(file);
  });
}

async function readFilesAsDocuments(files) {
  return Promise.all(
    [...files].map(async (file) => ({
      id: createId("document"),
      name: file.name,
      type: file.type,
      dataUrl: await readFileAsDataUrl(file),
    }))
  );
}

function mergeUniqueDocuments(existingDocuments, newDocuments) {
  const documents = [...existingDocuments];
  newDocuments.forEach((newDocument) => {
    const duplicate = documents.some(
      (documentItem) =>
        documentItem.name === newDocument.name &&
        documentItem.type === newDocument.type &&
        documentItem.dataUrl === newDocument.dataUrl
    );
    if (!duplicate) documents.push(newDocument);
  });
  return documents;
}

function openSavedDocument(dataUrl) {
  if (!dataUrl) return;
  const documentUrl = /^(data:|https?:|blob:|file:)/i.test(dataUrl)
    ? dataUrl
    : new URL(dataUrl, window.location.href).href;
  const win = window.open();
  if (win) {
    win.document.write(`<iframe src="${documentUrl}" style="border:0;width:100%;height:100vh"></iframe>`);
  }
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const MODALITY_LABELS = {
  "Ensino medio": "Ensino médio",
  "Ensino fundamental": "Ensino fundamental",
  "Cursos livres": "Cursos livres",
  "Tecnico": "Técnico",
  "Tecnologo": "Tecnólogo",
  "Sequencial superior": "Sequencial superior",
  "Graduacao": "Graduação",
  "Bacharel": "Bacharel",
  "Licenciatura": "Licenciatura",
  "Segunda licenciatura": "Segunda licenciatura",
  "Formacao pedagogica": "Formação pedagógica",
  "Pos-graduacao": "Pós - Graduação",
  "Mestrado": "Mestrado",
  "Doutorado": "Doutorado",
  "Detran": "Detran"
};

function getModalityLabel(m) {
  if (!m) return "";
  const key = Object.keys(MODALITY_LABELS).find(k => normalize(k) === normalize(m));
  return key ? MODALITY_LABELS[key] : m;
}

function matchesSearch(values, query) {
  return normalize(values.join(" ")).includes(normalize(query));
}

function uniqueOptions(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
}

function renderSelectOptions(select, options, selectedValue, allLabel) {
  select.innerHTML = [
    `<option value="">${escapeHtml(allLabel)}</option>`,
    ...options.map((option) => {
      const selected = option.value === selectedValue ? "selected" : "";
      return `<option value="${escapeHtml(option.value)}" ${selected}>${escapeHtml(option.label)}</option>`;
    }),
  ].join("");
}

function getPartner(partnerId) {
  return state.data.partners.find((partner) => partner.id === partnerId);
}

function getCourse(courseId) {
  return state.data.courses.find((course) => course.id === courseId);
}

function getSaleDetails(sale) {
  const course = getCourse(sale.courseId);
  const partner = course ? getPartner(course.partnerId) : null;
  return {
    course,
    partner,
    grossProfit: Number(sale.price || 0) - Number(sale.cost || 0),
    netProfit: Number(sale.price || 0) - Number(sale.cost || 0) - Number(sale.commission || 0),
  };
}

function getFinancialTotals() {
  const salesGrossProfit = state.data.sales.reduce((sum, sale) => {
    return sum + Number(sale.price || 0) - Number(sale.cost || 0);
  }, 0);
  const commissions = state.data.sales.reduce((sum, sale) => sum + Number(sale.commission || 0), 0);
  const expenses = state.data.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  return {
    salesGrossProfit,
    commissions,
    expenses,
    netProfit: salesGrossProfit - commissions - expenses,
  };
}

function getMonthlySummary(monthValue) {
  const sales = state.data.sales.filter((sale) => String(sale.date || "").startsWith(monthValue));
  const expenses = state.data.expenses.filter((expense) => String(expense.date || "").startsWith(monthValue));
  const grossProfit = sales.reduce((sum, sale) => {
    return sum + Number(sale.price || 0) - Number(sale.cost || 0);
  }, 0);
  const commissions = sales.reduce((sum, sale) => sum + Number(sale.commission || 0), 0);
  const expensesTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  return {
    salesCount: sales.length,
    netProfit: grossProfit - commissions - expensesTotal,
  };
}

function filteredCourses() {
  const courses = state.data.courses.filter((course) => {
    const partner = getPartner(course.partnerId);
    const viewMatch = state.selectedPartnerId === "all" || course.partnerId === state.selectedPartnerId;
    const typeMatch = !state.courseType || normalize(course.type) === normalize(state.courseType);
    const modalityMatch = !state.modality || isSameCourseModality(course.modality, state.modality);
    const searchMatch =
      !state.courseSearch ||
      matchesSearch(
        [
          course.name,
          course.type,
          course.modality,
          course.area,
          course.transfer,
          course.deadline,
          course.responsible,
          course.diplomas,
          course.notes,
          partner?.name,
          partner?.city,
        ],
        state.courseSearch
      );

    return viewMatch && typeMatch && modalityMatch && searchMatch;
  });

  const compareText = (left, right) =>
    String(left || "").localeCompare(String(right || ""), "pt-BR", { sensitivity: "base" });

  return courses.sort((left, right) => {
    const leftPartner = getPartner(left.partnerId);
    const rightPartner = getPartner(right.partnerId);

    switch (state.courseSort) {
      case "name-desc":
        return compareText(right.name, left.name);
      case "type-asc":
        return compareText(left.type, right.type) || compareText(left.name, right.name);
      case "type-desc":
        return compareText(right.type, left.type) || compareText(left.name, right.name);
      case "modality-asc":
        return compareText(left.modality, right.modality) || compareText(left.name, right.name);
      case "modality-desc":
        return compareText(right.modality, left.modality) || compareText(left.name, right.name);
      case "partner-asc":
        return compareText(leftPartner?.name, rightPartner?.name) || compareText(left.name, right.name);
      case "partner-desc":
        return compareText(rightPartner?.name, leftPartner?.name) || compareText(left.name, right.name);
      case "cost-asc":
        return Number(left.cost || 0) - Number(right.cost || 0);
      case "cost-desc":
        return Number(right.cost || 0) - Number(left.cost || 0);
      case "sale-asc":
        return Number(left.sale || 0) - Number(right.sale || 0);
      case "sale-desc":
        return Number(right.sale || 0) - Number(left.sale || 0);
      default:
        return compareText(left.name, right.name);
    }
  });
}

function filteredSales() {
  return state.data.sales.filter((sale) => {
    const { course, partner } = getSaleDetails(sale);
    const statusMatch = !state.salesStatus || sale.status === state.salesStatus;
    const monthMatch = !state.salesMonth || String(sale.date || "").startsWith(state.salesMonth);
    const dateFromMatch = !state.salesDateFrom || String(sale.date || "") >= state.salesDateFrom;
    const dateToMatch = !state.salesDateTo || String(sale.date || "") <= state.salesDateTo;
    const sellerMatch = !state.salesSeller || normalize(sale.seller) === normalize(state.salesSeller);
    const paymentMatch = !state.salesPayment || normalize(sale.payment) === normalize(state.salesPayment);
    const partnerMatch = !state.salesPartnerId || partner?.id === state.salesPartnerId;
    const courseMatch = !state.salesCourseId || course?.id === state.salesCourseId;
    const searchMatch =
      !state.salesSearch ||
      matchesSearch(
        [
          sale.student,
          sale.status,
          sale.seller,
          sale.payment,
          sale.quantity,
          course?.name,
          course?.modality,
          partner?.name,
        ],
        state.salesSearch
      );

    return (
      statusMatch &&
      monthMatch &&
      dateFromMatch &&
      dateToMatch &&
      sellerMatch &&
      paymentMatch &&
      partnerMatch &&
      courseMatch &&
      searchMatch
    );
  });
}

function filteredExpenses() {
  return state.data.expenses.filter((expense) => {
    const typeMatch = !state.expenseType || expense.type === state.expenseType;
    const searchMatch =
      !state.expenseSearch ||
      matchesSearch([expense.type, expense.description, expense.amount, expense.notes, expense.date], state.expenseSearch);

    return typeMatch && searchMatch;
  });
}

function renderSummary() {
  const totals = getMonthlySummary(state.summaryMonth);

  els.partnerCount.textContent = state.data.partners.length;
  els.courseCount.textContent = state.data.courses.length;
  els.salesCount.textContent = totals.salesCount;
  els.totalProfit.textContent = formatMoney(totals.netProfit);
}

function renderSidebarByRole() {
  document.querySelectorAll(".sidebar-item[data-sidebar-view]").forEach((item) => {
    const view = item.dataset.sidebarView;
    const isAllowed = isAdmin() || USER_ALLOWED_VIEWS.includes(view);
    item.style.display = isAllowed ? "" : "none";
  });
  const adminItems = document.querySelectorAll('[data-role="admin"]');
  adminItems.forEach((el) => {
    el.style.display = isAdmin() ? "" : "none";
  });
}

function renderMainView() {
  if (!isAdmin() && !USER_ALLOWED_VIEWS.includes(state.mainView)) {
    state.mainView = "courses";
  }

  const showingOverview = state.mainView === "overview";
  const showingCourses = state.mainView === "courses";
  const showingPartners = state.mainView === "partners";
  const showingSales = state.mainView === "sales";
  const showingCosts = state.mainView === "costs";
  const showingClients = state.mainView === "clients";
  const showingMarketing = state.mainView === "marketing";
  els.coursesView.hidden = !showingCourses;
  els.partnersView.hidden = !showingPartners;
  els.salesView.hidden = !showingSales;
  els.costsView.hidden = !showingCosts;
  els.clientsView.hidden = !showingClients;
  els.marketingView.hidden = !showingMarketing;
  if (els.summaryGrid) els.summaryGrid.classList.toggle("hidden", !showingOverview);

  els.mainTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mainView === state.mainView);
    if (!isAdmin()) {
      tab.style.display = tab.dataset.mainView === "courses" ? "" : "none";
    } else {
      tab.style.display = "";
    }
  });

  document.querySelectorAll(".sidebar-item[data-sidebar-view]").forEach((item) => {
    item.classList.toggle("active", item.dataset.sidebarView === state.mainView);
  });
}

function renderPartnersFull() {
  const search = document.querySelector("#partnerSearchFull")?.value?.toLowerCase() || "";
  const admin = isAdmin();
  const partners = state.data.partners.filter((p) =>
    !search || [p.name, p.type, p.city, p.contact].some((f) => (f || "").toLowerCase().includes(search))
  );
  const totalPages = Math.max(1, Math.ceil(partners.length / state.partnerPerPage));
  if (state.partnerPage > totalPages) state.partnerPage = totalPages;
  const start = (state.partnerPage - 1) * state.partnerPerPage;
  const visiblePartners = partners.slice(start, start + state.partnerPerPage);
  const tbody = document.querySelector("#partnerRowsFull");
  const cards = document.querySelector("#partnerCardsFull");
  const mobileTotal = document.querySelector("#partnerMobileTotal");
  const empty = document.querySelector("#emptyPartnerState");
  const partnerTotalDesktop = document.querySelector("#partnerTotalDesktop");
  const partnerCoursesDesktop = document.querySelector("#partnerCoursesDesktop");
  const partnerCitiesDesktop = document.querySelector("#partnerCitiesDesktop");
  const partnerActiveDesktop = document.querySelector("#partnerActiveDesktop");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (cards) cards.innerHTML = "";
  if (mobileTotal) mobileTotal.textContent = String(partners.length);
  if (partnerTotalDesktop) partnerTotalDesktop.textContent = String(partners.length);
  if (partnerCoursesDesktop) partnerCoursesDesktop.textContent = String(state.data.courses.length);
  if (partnerCitiesDesktop) partnerCitiesDesktop.textContent = String(new Set(partners.map((p) => (p.city || "").trim()).filter(Boolean)).size);
  if (partnerActiveDesktop) partnerActiveDesktop.textContent = String(partners.length);
  if (partners.length === 0) {
    empty.style.display = "";
    if (cards) cards.innerHTML = `<div class="empty-state visible">Nenhum parceiro encontrado.</div>`;
    renderPartnerPagination(0);
    return;
  }
  empty.style.display = "none";
  visiblePartners.forEach((p) => {
    const courseTotal = state.data.courses.filter((c) => c.partnerId === p.id).length;
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.innerHTML = `
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td>${escapeHtml(p.type || "-")}</td>
      <td>${escapeHtml(p.city || "-")}</td>
      <td>${escapeHtml(p.contact || "-")}</td>
      <td>${courseTotal}</td>
      <td class="action-cell">
        ${admin ? `<button class="row-action" type="button" data-partner-id="${escapeHtml(p.id)}" title="Ver detalhes/Editar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>` : ""}
      </td>
    `;
    tr.addEventListener("click", () => {
      state.mainView = "overview";
      state.selectedPartnerId = p.id;
      render();
      document.querySelectorAll(".sidebar-item").forEach((s) => s.classList.toggle("active", s.dataset.sidebarView === "overview"));
    });
    const btn = tr.querySelector(`[data-partner-id="${p.id}"]`);
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!isAdmin()) return;
        openPartnerDialog(p);
      });
    }
    tbody.appendChild(tr);

    if (cards) {
      const card = document.createElement("article");
      card.className = "partner-mobile-card";
      card.innerHTML = `
        <div class="partner-mobile-main">
          <span class="partner-mobile-icon" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/><path d="M9 21v-6h6v6"/></svg>
          </span>
          <div class="partner-mobile-title">
            <div class="partner-mobile-topline">
              <h3>${escapeHtml(p.name)}</h3>
              <span class="partner-status-badge">Ativo</span>
            </div>
            <small>${escapeHtml(p.type || "-")}</small>
          </div>
        </div>
        <div class="partner-mobile-info">
          <span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            ${escapeHtml(p.city || "-")}
          </span>
          <span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.11 5.18 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.72c.12.9.32 1.78.59 2.63a2 2 0 0 1-.45 2.11L9 10.7a16 16 0 0 0 4.3 4.3l1.24-1.24a2 2 0 0 1 2.11-.45c.85.27 1.73.47 2.63.59A2 2 0 0 1 22 16.92Z"/></svg>
            ${escapeHtml(p.contact || "-")}
          </span>
        </div>
        <div class="partner-mobile-footer">
          <span>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            ${courseTotal} ${courseTotal === 1 ? "curso" : "cursos"}
          </span>
          <button class="partner-card-details" type="button" data-partner-card-id="${escapeHtml(p.id)}">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>
            Ver detalhes
          </button>
        </div>
      `;
      cards.appendChild(card);
    }
  });

  document.querySelectorAll("[data-partner-card-id]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!isAdmin()) return;
      const partner = state.data.partners.find((p) => p.id === button.dataset.partnerCardId);
      if (!partner) return;
      openPartnerDialog(partner);
    });
  });

  document.querySelectorAll("[data-partner-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  });

  renderPartnerPagination(partners.length);
}

function renderPartnerPagination(total) {
  renderPagination({
    containerId: "partnerPagination",
    total,
    pageKey: "partnerPage",
    perPageKey: "partnerPerPage",
    label: "parceiros",
    selectId: "partnerPerPageSelect",
    onChange: renderPartnersFull,
  });
}

function renderCourses() {
  const allCourses = filteredCourses();
  els.courseRows.innerHTML = "";
  if (els.courseCards) els.courseCards.innerHTML = "";
  els.emptyState.classList.toggle("visible", allCourses.length === 0);
  if (els.courseCards && allCourses.length === 0) {
    els.courseCards.innerHTML = `<div class="empty-state visible">Nenhum curso encontrado.</div>`;
  }

  const admin = isAdmin();

  document.querySelectorAll(".course-admin-only").forEach((cell) => {
    cell.hidden = !admin;
  });

  const totalPages = Math.max(1, Math.ceil(allCourses.length / state.coursePerPage));
  if (state.coursePage > totalPages) state.coursePage = totalPages;
  const start = (state.coursePage - 1) * state.coursePerPage;
  const courses = allCourses.slice(start, start + state.coursePerPage);

  courses.forEach((course) => {
    const partner = getPartner(course.partnerId);
    const courseType = course.type || getCourseTypeFromModality(course.modality);
    const modality = getModalityLabel(course.modality);
    const deadline = course.deadline || "Não informado";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="course-detail-cell">
        <strong>${escapeHtml(course.name)}</strong>
        <small>${escapeHtml(modality || "")}</small>
      </td>
      <td>
        ${course.examDataUrl 
          ? `<button class="margin-pill" type="button" data-open-exam="${escapeHtml(course.id)}" title="Abrir prova: ${escapeHtml(course.examFileName)}">Sim</button>` 
          : `<span class="margin-pill">—</span>`}
      </td>
      <td><span class="margin-pill">${escapeHtml(courseType)}</span></td>
      <td><span class="margin-pill">${escapeHtml(modality)}</span></td>
      <td>
        <strong>${escapeHtml(partner?.name || "Parceria removida")}</strong>
      </td>
      ${admin ? `<td>${escapeHtml(course.deadline || "-")}</td>` : ""}
      ${admin ? `<td>${formatMoney(course.cost)}</td>` : ""}
      <td>${formatMoney(course.sale)}</td>
      <td class="action-cell">
        ${admin ? `<button class="row-action" type="button" data-course-id="${escapeHtml(course.id)}" title="Editar curso">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>` : ""}
        ${admin ? `<button class="row-action" type="button" data-sale-course-id="${escapeHtml(course.id)}" title="Adicionar venda">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        </button>` : ""}
        <button class="row-action" type="button" title="Visualizar" style="opacity:0.4;cursor:default;" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </td>
    `;
    els.courseRows.appendChild(row);

    if (els.courseCards) {
      const card = document.createElement("article");
      card.className = "course-mobile-card";
      card.innerHTML = `
        <div class="course-card-main">
          <div class="course-card-icon" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.1 2.7 2 6 2s6-.9 6-2v-5"/></svg>
          </div>
          <div class="course-card-content">
            <div class="course-card-topline">
              <h3>${escapeHtml(course.name)}</h3>
              <span class="course-card-status">${course.examDataUrl ? "Prova" : "Ativo"}</span>
            </div>
            <small>${escapeHtml(modality || "-")}</small>
            <div class="course-card-tags">
              <span>${escapeHtml(courseType || "-")}</span>
              <span>${escapeHtml(modality || "-")}</span>
            </div>
          </div>
        </div>
        <div class="course-card-info">
          <span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/><path d="M9 21v-6h6v6"/></svg>
            ${escapeHtml(partner?.name || "Parceria removida")}
          </span>
          <span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            ${escapeHtml(deadline)}
          </span>
          <span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
            ${formatMoney(course.sale)}
          </span>
        </div>
        <div class="course-card-actions">
          ${admin ? `<button class="course-card-secondary" type="button" data-course-id="${escapeHtml(course.id)}">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Ver detalhes
          </button>` : ""}
          ${admin ? `<button class="course-card-primary" type="button" data-sale-course-id="${escapeHtml(course.id)}">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            Adicionar
          </button>` : `<span class="course-card-secondary course-card-secondary-full">Informações do curso</span>`}
        </div>
      `;
      els.courseCards.appendChild(card);
    }
  });

  document.querySelectorAll("[data-course-id]").forEach((button) => {
    button.addEventListener("click", () => {
      openCourseDialog(getCourse(button.dataset.courseId));
    });
  });

  document.querySelectorAll("[data-sale-course-id]").forEach((button) => {
    button.addEventListener("click", () => {
      openSaleDialog(null, getCourse(button.dataset.saleCourseId));
    });
  });

  document.querySelectorAll("[data-course-site]").forEach((button) => {
    button.addEventListener("click", () => {
      const partner = getPartner(button.dataset.courseSite);
      window.open(normalizeUrl(partner?.siteUrl), "_blank", "noopener");
    });
  });

  document.querySelectorAll("[data-course-mec]").forEach((button) => {
    button.addEventListener("click", () => {
      const partner = getPartner(button.dataset.courseMec);
      window.open(normalizeUrl(partner?.mecUrl), "_blank", "noopener");
    });
  });

  document.querySelectorAll("[data-course-contract]").forEach((button) => {
    button.addEventListener("click", () => {
      const partner = getPartner(button.dataset.courseContract);
      openSavedDocument(partner?.contractDataUrl);
    });
  });

  document.querySelectorAll("[data-course-catalog]").forEach((button) => {
    button.addEventListener("click", () => {
      const partner = getPartner(button.dataset.courseCatalog);
      state.selectedPartnerId = partner?.id || "";
      state.mainView = "partners";
      render();
    });
  });

  document.querySelectorAll("[data-course-documents]").forEach((button) => {
    button.addEventListener("click", () => {
      const partner = getPartner(button.dataset.courseDocuments);
      state.selectedPartnerId = partner?.id || "";
      state.mainView = "partners";
      render();
    });
  });

  document.querySelectorAll("[data-open-exam]").forEach((button) => {
    button.addEventListener("click", () => {
      const course = getCourse(button.dataset.openExam);
      if (course?.examDataUrl) {
        openSavedDocument(course.examDataUrl);
      }
    });
  });

  renderCoursePagination(allCourses.length);
}

function renderCoursePagination(total) {
  renderPagination({
    containerId: "coursePagination",
    total,
    pageKey: "coursePage",
    perPageKey: "coursePerPage",
    label: "cursos",
    selectId: "coursePerPageSelect",
    onChange: renderCourses,
  });
}

function renderPagination({ containerId, total, pageKey, perPageKey, label, selectId, onChange }) {
  const container = document.querySelector(`#${containerId}`);
  if (!container) return;

  const perPage = state[perPageKey];
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = state[pageKey];
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  let pagesHtml = "";
  const maxVisible = 5;
  let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  if (startPage > 1) {
    pagesHtml += `<button class="pagination-page" data-page="1">1</button>`;
    if (startPage > 2) pagesHtml += `<span class="pagination-ellipsis">...</span>`;
  }
  for (let i = startPage; i <= endPage; i++) {
    pagesHtml += `<button class="pagination-page${i === page ? " active" : ""}" data-page="${i}">${i}</button>`;
  }
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) pagesHtml += `<span class="pagination-ellipsis">...</span>`;
    pagesHtml += `<button class="pagination-page" data-page="${totalPages}">${totalPages}</button>`;
  }

  container.innerHTML = `
    <span class="pagination-info">Mostrando ${from} a ${to} de ${total} ${label}</span>
    <div class="pagination-controls">
      <button class="pagination-nav" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>&lt;</button>
      ${pagesHtml}
      <button class="pagination-nav" data-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}>&gt;</button>
    </div>
    <label class="pagination-per-page">
      <select id="${selectId}">
        <option value="5" ${perPage === 5 ? "selected" : ""}>5 por página</option>
        <option value="10" ${perPage === 10 ? "selected" : ""}>10 por página</option>
        <option value="25" ${perPage === 25 ? "selected" : ""}>25 por página</option>
        <option value="50" ${perPage === 50 ? "selected" : ""}>50 por página</option>
      </select>
    </label>
  `;

  container.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = Number(btn.dataset.page);
      if (p >= 1 && p <= totalPages) {
        state[pageKey] = p;
        onChange();
      }
    });
  });

  const select = container.querySelector(`#${selectId}`);
  if (select) {
    select.addEventListener("change", () => {
      state[perPageKey] = Number(select.value);
      state[pageKey] = 1;
      onChange();
    });
  }
}

function renderSales() {
  const sales = filteredSales();
  const totals = sales.reduce(
    (acc, sale) => {
      acc.cost += Number(sale.cost || 0);
      acc.price += Number(sale.price || 0);
      acc.commission += Number(sale.commission || 0);
      acc.profit += Number(sale.price || 0) - Number(sale.cost || 0);
      return acc;
    },
    { cost: 0, price: 0, commission: 0, profit: 0 }
  );

  els.salesCostTotal.textContent = formatMoney(totals.cost);
  els.salesRevenueTotal.textContent = formatMoney(totals.price);
  els.salesProfitTotal.textContent = formatMoney(totals.profit);
  els.salesCommissionTotal.textContent = formatMoney(totals.commission);
  els.salesFinalProfitTotal.textContent = formatMoney(totals.profit - totals.commission);
  els.salesRows.innerHTML = "";
  els.salesEmptyState.classList.toggle("visible", sales.length === 0);

  sales.forEach((sale) => {
    const { course, partner, grossProfit, netProfit } = getSaleDetails(sale);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${formatDate(sale.date)}</td>
      <td>${escapeHtml(sale.student)}</td>
      <td>${escapeHtml(getModalityLabel(course?.modality || ""))}</td>
      <td>${escapeHtml(course?.name || "Curso removido")}</td>
      <td>${escapeHtml(partner?.name || "Parceria removida")}</td>
      <td>${escapeHtml(sale.status)}</td>
      <td class="money-cell sale-cell">${formatMoney(sale.price)}</td>
      <td class="money-cell cost-cell">${formatMoney(sale.cost)}</td>
      <td class="money-cell profit-cell">${formatMoney(grossProfit)}</td>
      <td class="money-cell commission-cell">${formatMoney(sale.commission)}</td>
      <td class="money-cell final-profit-cell">${formatMoney(netProfit)}</td>
      <td>${escapeHtml(sale.seller)}</td>
      <td>${escapeHtml(sale.payment)}</td>
      <td>${escapeHtml(sale.quantity)}</td>
      <td><button class="row-action" type="button" data-sale-id="${escapeHtml(sale.id)}">Editar</button></td>
    `;
    els.salesRows.appendChild(row);
  });

  document.querySelectorAll("[data-sale-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const sale = state.data.sales.find((item) => item.id === button.dataset.saleId);
      openSaleDialog(sale);
    });
  });
}

function renderExpenses() {
  const expenses = filteredExpenses();
  const totals = getFinancialTotals();

  els.expensesTotal.textContent = formatMoney(totals.expenses);
  els.commissionsTotal.textContent = formatMoney(totals.commissions);
  els.netProfitTotal.textContent = formatMoney(totals.netProfit);
  els.expenseRows.innerHTML = "";
  els.expensesEmptyState.classList.toggle("visible", expenses.length === 0);

  expenses.forEach((expense) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${formatDate(expense.date)}</td>
      <td>${escapeHtml(expense.type)}</td>
      <td>${escapeHtml(expense.description)}</td>
      <td class="money-cell expense-cell">${formatMoney(expense.amount)}</td>
      <td>${escapeHtml(expense.notes)}</td>
      <td><button class="row-action" type="button" data-expense-id="${escapeHtml(expense.id)}">Editar</button></td>
    `;
    els.expenseRows.appendChild(row);
  });

  document.querySelectorAll("[data-expense-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const expense = state.data.expenses.find((item) => item.id === button.dataset.expenseId);
      openExpenseDialog(expense);
    });
  });
}

function renderClients() {
  const clients = state.data.clients || [];
  const search = state.clientSearch?.toLowerCase() || "";
  const admin = isAdmin();
  const filtered = clients.filter((client) => {
    if (!search) return true;
    const course = state.data.courses.find((c) => c.id === client.courseId);
    const partner = state.data.partners.find((p) => p.id === client.partnerId || course?.partnerId);
    const text = [
      client.name,
      client.cpf,
      client.email,
      client.phone,
      course?.name,
      partner?.name,
    ].filter(Boolean).join(" ");
    return text.toLowerCase().includes(search);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / state.clientPerPage));
  if (state.clientPage > totalPages) state.clientPage = totalPages;
  const start = (state.clientPage - 1) * state.clientPerPage;
  const visibleClients = filtered.slice(start, start + state.clientPerPage);

  els.clientRows.innerHTML = "";
  if (els.clientCards) els.clientCards.innerHTML = "";
  els.emptyClientState.classList.toggle("visible", filtered.length === 0);
  if (els.clientCards && filtered.length === 0) {
    els.clientCards.innerHTML = `<div class="empty-state visible">Nenhum cliente encontrado.</div>`;
  }

  visibleClients.forEach((client) => {
    const course = state.data.courses.find((c) => c.id === client.courseId);
    const partner = state.data.partners.find((p) => p.id === client.partnerId || course?.partnerId);
    const statusClassOk = "status-ok";
    const statusClassEmpty = "status-empty";
    const getStatus = (file) => (file ? statusClassOk : statusClassEmpty);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${escapeHtml(client.name)}</strong></td>
      <td>${escapeHtml(partner?.name || "—")}</td>
      <td>${escapeHtml(course?.name || "—")}</td>
      <td>
        ${client.contractDataUrl 
          ? `<button class="doc-status status-ok" type="button" data-open-doc="contract" data-client-id-doc="${escapeHtml(client.id)}" title="Abrir contrato">●</button>` 
          : `<span class="doc-status status-empty" title="Sem contrato">●</span>`}
      </td>
      <td>
        ${client.historyDataUrl 
          ? `<button class="doc-status status-ok" type="button" data-open-doc="history" data-client-id-doc="${escapeHtml(client.id)}" title="Abrir histórico">●</button>` 
          : `<span class="doc-status status-empty" title="Sem histórico">●</span>`}
      </td>
      <td>
        ${client.declarationDataUrl 
          ? `<button class="doc-status status-ok" type="button" data-open-doc="declaration" data-client-id-doc="${escapeHtml(client.id)}" title="Abrir declaração">●</button>` 
          : `<span class="doc-status status-empty" title="Sem declaração">●</span>`}
      </td>
      <td>
        ${client.diplomaDataUrl 
          ? `<button class="doc-status status-ok" type="button" data-open-doc="diploma" data-client-id-doc="${escapeHtml(client.id)}" title="Abrir diploma">●</button>` 
          : `<span class="doc-status status-empty" title="Sem diploma">●</span>`}
      </td>
      <td>${admin ? `<button class="row-action" type="button" data-client-id="${escapeHtml(client.id)}">Editar</button>` : ""}</td>
    `;
    els.clientRows.appendChild(row);

    if (els.clientCards) {
      const docItems = [
        ["Contrato", "contract", client.contractDataUrl],
        ["Histórico", "history", client.historyDataUrl],
        ["Declaração", "declaration", client.declarationDataUrl],
        ["Diploma", "diploma", client.diplomaDataUrl],
      ];
      const card = document.createElement("article");
      card.className = "client-mobile-card";
      card.innerHTML = `
        <div class="client-mobile-head">
          <span class="client-mobile-avatar">${escapeHtml(getInitials(client.name))}</span>
          <div>
            <h3>${escapeHtml(client.name)}</h3>
            <p>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.1 2.7 2 6 2s6-.9 6-2v-5"/></svg>
              ${escapeHtml(course?.name || "—")}
            </p>
            <p>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/><path d="M9 21v-6h6v6"/></svg>
              ${escapeHtml(partner?.name || "—")}
            </p>
          </div>
        </div>
        <div class="client-doc-grid">
          ${docItems.map(([label, key, dataUrl]) => `
            <button class="client-doc-item ${dataUrl ? "is-ok" : ""}" type="button" ${dataUrl ? `data-open-doc="${key}" data-client-id-doc="${escapeHtml(client.id)}"` : "disabled"}>
              <span class="client-doc-dot"></span>
              <span>${label}</span>
              <strong>${dataUrl ? "OK" : "—"}</strong>
            </button>
          `).join("")}
        </div>
        ${admin ? `<button class="client-card-edit" type="button" data-client-id="${escapeHtml(client.id)}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>
          Editar cliente
        </button>` : ""}
      `;
      els.clientCards.appendChild(card);
    }
  });

  document.querySelectorAll("[data-client-id]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!isAdmin()) return;
      const client = state.data.clients?.find((c) => c.id === button.dataset.clientId);
      openClientDialog(client);
    });
  });

  document.querySelectorAll("[data-open-doc]").forEach((button) => {
    button.addEventListener("click", () => {
      const client = state.data.clients?.find((c) => c.id === button.dataset.clientIdDoc);
      if (!client) return;
      const docType = button.dataset.openDoc;
      const dataUrl = client[`${docType}DataUrl`];
      openSavedDocument(dataUrl);
    });
  });

  renderClientPagination(filtered.length);
}

function renderClientPagination(total) {
  renderPagination({
    containerId: "clientPagination",
    total,
    pageKey: "clientPage",
    perPageKey: "clientPerPage",
    label: "clientes",
    selectId: "clientPerPageSelect",
    onChange: renderClients,
  });
}

function renderCoursePartnerOptions() {
  els.coursePartner.innerHTML = state.data.partners
    .map((partner) => `<option value="${escapeHtml(partner.id)}">${escapeHtml(partner.name)}</option>`)
    .join("");
}

function renderSaleCourseOptions(search = "", selectedCourseId = els.saleCourse?.value || "") {
  const normalizedSearch = normalize(search);
  const courses = state.data.courses
    .filter((course) => {
      const partner = getPartner(course.partnerId);
      return !search || matchesSearch([course.name, course.type, course.modality, course.area, partner?.name], search);
    })
    .sort((a, b) => {
      const aName = normalize(a.name);
      const bName = normalize(b.name);
      const aStarts = normalizedSearch && aName.startsWith(normalizedSearch) ? 0 : 1;
      const bStarts = normalizedSearch && bName.startsWith(normalizedSearch) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name, "pt-BR");
    });

  const placeholder = courses.length
    ? "Selecione o curso correto"
    : "Nenhum curso encontrado";
  els.saleCourse.innerHTML = [
    `<option value="">${placeholder}</option>`,
    ...courses.map((course) => {
      const partner = getPartner(course.partnerId);
      return `<option value="${escapeHtml(course.id)}">${escapeHtml(course.name)} - ${escapeHtml(partner?.name || "Sem parceria")}</option>`;
    }),
  ].join("");

  if (courses.some((course) => course.id === selectedCourseId)) {
    els.saleCourse.value = selectedCourseId;
  } else {
    els.saleCourse.value = "";
  }
}

function renderSalesFilterOptions() {
  renderSelectOptions(
    els.salesSellerFilter,
    uniqueOptions(state.data.sales.map((sale) => sale.seller)).map((seller) => ({
      value: seller,
      label: seller,
    })),
    state.salesSeller,
    "Todos vendedores"
  );

  renderSelectOptions(
    els.salesPaymentFilter,
    uniqueOptions(state.data.sales.map((sale) => sale.payment)).map((payment) => ({
      value: payment,
      label: payment,
    })),
    state.salesPayment,
    "Todas formas"
  );

  renderSelectOptions(
    els.salesPartnerFilter,
    state.data.partners.map((partner) => ({
      value: partner.id,
      label: partner.name,
    })),
    state.salesPartnerId,
    "Todas instituicoes"
  );

  renderSelectOptions(
    els.salesCourseFilter,
    state.data.courses.map((course) => {
      const partner = getPartner(course.partnerId);
      return {
        value: course.id,
        label: `${course.name} - ${partner?.name || "Sem parceria"}`,
      };
    }),
    state.salesCourseId,
    "Todos cursos"
  );
}

function renderMarketing() {
  const materials = state.data.marketing.filter((material) => {
    const categoryMatch = !state.marketingCategory || material.category === state.marketingCategory;
    const searchMatch =
      !state.marketingSearch ||
      matchesSearch([material.name, material.category, material.description], state.marketingSearch);
    return categoryMatch && searchMatch;
  });

  els.marketingList.innerHTML = "";
  if (!materials.length) {
    els.marketingList.innerHTML = `<div class="empty-state visible">Nenhum material de marketing encontrado.</div>`;
    return;
  }

  const categories = uniqueOptions(materials.map((material) => material.category));
  categories.forEach((category) => {
    const section = document.createElement("section");
    section.className = "marketing-category";
    section.innerHTML = `<h2>${escapeHtml(category)}</h2><div class="marketing-category-list"></div>`;
    const list = section.querySelector(".marketing-category-list");

    materials
      .filter((material) => material.category === category)
      .forEach((material) => {
        const item = document.createElement("article");
        item.className = "marketing-item";
        item.innerHTML = `
          <div>
            <strong>${escapeHtml(material.name)}</strong>
            <span>${escapeHtml(material.description || "Sem descricao")}</span>
          </div>
          <div class="document-actions">
            <button class="link-action" type="button" data-open-marketing="${escapeHtml(material.id)}">Abrir</button>
            <button class="remove-file-action" type="button" data-remove-marketing="${escapeHtml(material.id)}" aria-label="Excluir material">x</button>
          </div>
        `;
        list.appendChild(item);
      });

    els.marketingList.appendChild(section);
  });

  document.querySelectorAll("[data-open-marketing]").forEach((button) => {
    button.addEventListener("click", () => {
      const material = state.data.marketing.find((item) => item.id === button.dataset.openMarketing);
      openSavedDocument(material?.dataUrl);
    });
  });

  document.querySelectorAll("[data-remove-marketing]").forEach((button) => {
    button.addEventListener("click", () => {
      state.data.marketing = state.data.marketing.filter((item) => item.id !== button.dataset.removeMarketing);
      saveData();
      renderMarketing();
    });
  });
}

function renderPartnerEditAttachments(partner) {
  els.partnerEditCatalogsList.innerHTML = "";
  els.partnerEditDocumentsList.innerHTML = "";
  els.removePartnerContract.style.display = partner?.contractDataUrl ? "inline-flex" : "none";

  if (!partner) {
    return;
  }

  if (partner.catalogs.length) {
    const title = document.createElement("strong");
    title.className = "attachment-group-title";
    title.textContent = "Catalogos";
    els.partnerEditCatalogsList.appendChild(title);
  }

  partner.catalogs.forEach((catalog) => {
    const item = document.createElement("div");
    item.className = "document-item compact";
    item.innerHTML = `
      <span>${escapeHtml(catalog.name)}</span>
      <button class="remove-file-action" type="button" data-remove-catalog="${escapeHtml(catalog.id)}" aria-label="Remover catalogo">x</button>
    `;
    els.partnerEditCatalogsList.appendChild(item);
  });

  if (partner.documents.length) {
    const title = document.createElement("strong");
    title.className = "attachment-group-title";
    title.textContent = "Outros documentos";
    els.partnerEditDocumentsList.appendChild(title);
  }

  partner.documents.forEach((documentItem) => {
    const item = document.createElement("div");
    item.className = "document-item compact";
    item.innerHTML = `
      <span>${escapeHtml(documentItem.name)}</span>
      <button class="remove-file-action" type="button" data-remove-document="${escapeHtml(documentItem.id)}" aria-label="Remover documento">x</button>
    `;
    els.partnerEditDocumentsList.appendChild(item);
  });

  document.querySelectorAll("[data-remove-catalog]").forEach((button) => {
    button.addEventListener("click", () => {
      partner.catalogs = partner.catalogs.filter((catalog) => catalog.id !== button.dataset.removeCatalog);
      saveData();
      renderPartnerEditAttachments(partner);
    });
  });

  document.querySelectorAll("[data-remove-document]").forEach((button) => {
    button.addEventListener("click", () => {
      partner.documents = partner.documents.filter((item) => item.id !== button.dataset.removeDocument);
      saveData();
      renderPartnerEditAttachments(partner);
    });
  });
}

function renderCourseTypeFilters() {
  const baseCourses = state.data.courses.filter((course) =>
    state.selectedPartnerId === "all" || course.partnerId === state.selectedPartnerId
  );

  document.querySelectorAll("[data-course-type]").forEach((card) => {
    const isType = card.dataset.courseType;
    card.classList.toggle("active", isType && normalize(card.dataset.courseType) === normalize(state.courseType));
    const count = isType
      ? baseCourses.filter((course) => normalize(getCourseTypeValue(course)) === normalize(isType)).length
      : baseCourses.length;
    updateCourseFilterCount(card, count);
  });
}

function updateCourseFilterCount(card, count) {
  let badge = card.querySelector(".modality-card-count");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "modality-card-count";
    card.appendChild(badge);
  }
  badge.textContent = String(count);
}

function renderModalityFilterCards() {
  const typeGroup = getCourseTypeGroup(state.courseType);
  const allowedModalities = typeGroup ? typeGroup.modalities : null;
  const baseCourses = state.data.courses.filter((course) =>
    state.selectedPartnerId === "all" || course.partnerId === state.selectedPartnerId
  );

  document.querySelectorAll(".modality-filter-card").forEach((card) => {
    const modality = card.dataset.modality;
    const matchesType = !allowedModalities || allowedModalities.some((m) => isSameCourseModality(m, modality));
    card.classList.toggle("active", isSameCourseModality(modality || "", state.modality || ""));
    card.style.display = matchesType ? "" : "none";
    const count = baseCourses.filter((course) => isSameCourseModality(course.modality, modality)).length;
    updateCourseFilterCount(card, count);
  });

  document.querySelectorAll("[data-modality-all]").forEach((card) => {
    card.classList.toggle("active", !state.courseType && !state.modality);
  });
}

function updateCourseModalityOptions() {
  const typeGroup = getCourseTypeGroup(els.courseType.value);
  const modalities = typeGroup ? typeGroup.modalities : ALL_COURSE_MODALITIES;
  const currentValue = els.courseModality.value;
  els.courseModality.innerHTML = modalities.map((m) =>
    `<option value="${escapeHtml(m)}">${escapeHtml(getModalityLabel(m))}</option>`
  ).join("");
  if (modalities.includes(currentValue)) {
    els.courseModality.value = currentValue;
  } else if (modalities.length) {
    els.courseModality.value = modalities[0];
  }
}

function render() {
  renderSummary();
  renderMainView();
  renderCourseTypeFilters();
  renderModalityFilterCards();
  renderCourses();
  renderSales();
  renderExpenses();
  renderCoursePartnerOptions();
  renderSaleCourseOptions();
  renderSalesFilterOptions();
  renderPartnersFull();
  renderClients();
  renderMarketing();
  renderProfile();
  renderSidebarByRole();
  const admin = isAdmin();
  document.querySelectorAll("[data-admin-only-action]").forEach((button) => {
    button.classList.toggle("is-hidden-for-user", !admin);
    button.hidden = !admin;
    button.setAttribute("aria-hidden", String(!admin));
  });
  if (els.addCourseBtn) els.addCourseBtn.style.display = admin ? "" : "none";
  if (els.addClientBtn) els.addClientBtn.style.display = admin ? "" : "none";
  document.querySelectorAll("#courseSort option[value^='cost-'], #courseSort option[value^='sale-']").forEach((opt) => {
    opt.style.display = admin ? "" : "none";
  });
}

function openPartnerDialog(partner = null) {
  if (!isAdmin()) return;
  els.partnerDialogTitle.textContent = partner ? "Editar parceria" : "Nova parceria";
  els.partnerId.value = partner?.id || "";
  els.partnerName.value = partner?.name || "";
  els.partnerType.value = partner?.type || "";
  els.partnerCity.value = partner?.city || "";
  els.partnerContact.value = partner?.contact || "";
  els.partnerNotes.value = partner?.notes || "";
  els.partnerSite.value = partner?.siteUrl || "";
  els.partnerMecUrl.value = partner?.mecUrl || "";
  els.partnerContract.value = "";
  if (partner?.contractFileName) {
    els.partnerContractStatus.innerHTML = `Contrato salvo: <a href="#" id="viewPartnerContractLink" class="file-link" style="color: var(--brand); text-decoration: underline; cursor: pointer; font-weight: 600;">${escapeHtml(partner.contractFileName)}</a>`;
    const link = document.getElementById("viewPartnerContractLink");
    if (link) {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        if (partner.contractDataUrl) {
          openSavedDocument(partner.contractDataUrl);
        }
      });
    }
  } else {
    els.partnerContractStatus.textContent = "Nenhum contrato salvo.";
  }
  els.partnerCatalog.value = "";
  els.partnerCatalogStatus.textContent = partner?.catalogs.length
    ? `${partner.catalogs.length} catalogo(s) salvo(s). Novos arquivos serao adicionados a lista.`
    : "Nenhum catalogo salvo.";
  els.partnerDocuments.value = "";
  els.deletePartner.style.visibility = partner ? "visible" : "hidden";
  els.partnerFormMessage.textContent = "";
  renderPartnerEditAttachments(partner);
  els.partnerDialog.showModal();
}

function openClientDialog(client = null) {
  if (!isAdmin()) return;
  els.clientDialogTitle.textContent = client ? "Editar cliente" : "Novo cliente";
  els.clientId.value = client?.id || "";
  els.clientName.value = client?.name || "";
  els.clientCpf.value = client?.cpf || "";
  els.clientPhone.value = client?.phone || "";
  els.clientEmail.value = client?.email || "";
  els.clientContractFile.value = "";
  els.clientHistoryFile.value = "";
  els.clientDeclarationFile.value = "";
  els.clientDiplomaFile.value = "";

  els.clientPartner.innerHTML = state.data.partners
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
    .join("");

  const partnerId = client?.partnerId || state.data.partners[0]?.id || "";
  els.clientPartner.value = partnerId;

  els.clientCourse.innerHTML = state.data.courses
    .filter((c) => c.partnerId === partnerId)
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
    .join("");

  if (client?.courseId) {
    els.clientCourse.value = client.courseId;
  }

  els.deleteClient.style.visibility = client ? "visible" : "hidden";
  els.clientDialog.showModal();
}

function openCourseDialog(course = null) {
  if (!isAdmin()) return;
  if (!state.data.partners.length) {
    openPartnerDialog();
    return;
  }

  els.courseDialogTitle.textContent = course ? "Editar curso" : "Novo curso";
  els.courseId.value = course?.id || "";
  els.coursePartner.value =
    course?.partnerId || (state.selectedPartnerId !== "all" ? state.selectedPartnerId : state.data.partners[0].id);
  els.courseName.value = course?.name || "";
  els.courseType.value = course?.type || getCourseTypeFromModality(course?.modality || "Graduacao");
  updateCourseModalityOptions();
  els.courseModality.value = course?.modality || "Graduacao";
  const pricingFields = document.querySelector("#coursePricingFields");
  if (pricingFields) pricingFields.style.display = isAdmin() ? "" : "none";
  els.courseCost.required = isAdmin();
  els.courseSale.required = isAdmin();
  els.courseCost.value = course?.cost ?? "";
  els.courseSale.value = course?.sale ?? "";
  els.courseTransfer.value = course?.transfer || "";
  els.courseDeadline.value = course?.deadline || "";
  els.courseResponsible.value = course?.responsible || "";
  els.courseDiplomas.value = course?.diplomas || "";
  els.courseExamFile.value = "";
  if (course?.examFileName) {
    els.courseExamStatus.innerHTML = `Prova salva: <a href="#" id="viewCourseExamLink" class="file-link" style="color: var(--brand); text-decoration: underline; cursor: pointer; font-weight: 600;">${escapeHtml(course.examFileName)}</a>`;
    els.removeCourseExam.style.display = "inline-flex";
    const link = document.getElementById("viewCourseExamLink");
    if (link) {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        if (course.examDataUrl) {
          openSavedDocument(course.examDataUrl);
        }
      });
    }
  } else {
    els.courseExamStatus.textContent = "Nenhuma prova salva.";
    els.removeCourseExam.style.display = "none";
  }
  els.courseNotes.value = course?.notes || "";
  els.deleteCourse.style.visibility = course ? "visible" : "hidden";
  els.courseDialog.showModal();
}

function openSaleDialog(sale = null, selectedCourse = null) {
  if (!isAdmin()) return;
  if (!state.data.courses.length) {
    openCourseDialog();
    return;
  }

  const course = selectedCourse || getCourse(sale?.courseId) || null;
  els.saleCourseSearch.value = "";
  renderSaleCourseOptions("", course?.id || "");
  els.saleDialogTitle.textContent = sale ? "Editar venda" : "Nova venda";
  els.saleId.value = sale?.id || "";
  els.saleCourse.value = course?.id || "";
  els.saleDate.value = sale?.date || today();
  els.saleStudent.value = sale?.student || "";
  els.saleStatus.value = sale?.status || "Fechado";
  els.saleSeller.value = sale?.seller || "";
  els.salePayment.value = sale?.payment || "";
  els.saleQuantity.value = sale?.quantity || "";
  els.saleCost.value = sale?.cost ?? course?.cost ?? "";
  els.salePrice.value = sale?.price ?? course?.sale ?? "";
  els.saleCommission.value = sale?.commission ?? "";
  els.saleFormMessage.textContent = "";
  els.saveSale.disabled = false;
  els.saveSale.textContent = "Salvar venda";
  commissionLastEdited = "value";
  updateCommissionPercentFromValue();
  els.deleteSale.style.visibility = sale ? "visible" : "hidden";
  state.mainView = "sales";
  render();
  els.saleDialog.showModal();
}

function syncSaleValuesFromCourse() {
  const course = getCourse(els.saleCourse.value);
  if (!course) return;
  els.saleCost.value = course.cost ?? "";
  els.salePrice.value = course.sale ?? "";
  updateCommissionFromLastEdited();
}

let commissionLastEdited = "value";

function getSaleGrossProfitValue() {
  return Number(els.salePrice.value || 0) - Number(els.saleCost.value || 0);
}

function updateCommissionPercentFromValue() {
  const grossProfit = getSaleGrossProfitValue();
  if (els.saleCommission.value === "") {
    els.saleCommissionPercent.value = "";
    return;
  }
  const commission = Number(els.saleCommission.value || 0);
  els.saleCommissionPercent.value = grossProfit ? roundCurrency((commission / grossProfit) * 100) : "";
}

function updateCommissionValueFromPercent() {
  if (els.saleCommissionPercent.value === "") {
    els.saleCommission.value = "";
    return;
  }
  const grossProfit = getSaleGrossProfitValue();
  const percent = Number(els.saleCommissionPercent.value || 0);
  els.saleCommission.value = roundCurrency((grossProfit * percent) / 100);
}

function updateCommissionFromLastEdited() {
  if (commissionLastEdited === "percent") {
    updateCommissionValueFromPercent();
  } else {
    updateCommissionPercentFromValue();
  }
}

function openExpenseDialog(expense = null) {
  els.expenseDialogTitle.textContent = expense ? "Editar custo" : "Novo custo";
  els.expenseId.value = expense?.id || "";
  els.expenseDate.value = expense?.date || today();
  els.expenseType.value = expense?.type || "Marketing semanal";
  els.expenseDescription.value = expense?.description || "";
  els.expenseAmount.value = expense?.amount ?? "";
  els.expenseNotes.value = expense?.notes || "";
  els.deleteExpense.style.visibility = expense ? "visible" : "hidden";
  els.expenseDialog.showModal();
}

async function upsertPartner() {
  const id = els.partnerId.value || createId("partner");
  const existing = state.data.partners.find((partner) => partner.id === id);
  const contractFile = els.partnerContract.files[0];
  const currentContractFileName = existing?.contractFileName || "";
  const currentContractDataUrl = existing?.contractDataUrl || "";
  
  let contractDataUrl = currentContractDataUrl;
  if (contractFile) {
    try {
      contractDataUrl = await readFileAsDataUrl(contractFile);
    } catch (error) {
      console.error("Erro ao ler arquivo do contrato:", error);
      alert("Erro ao ler arquivo do contrato");
    }
  }
  
  let newCatalogs = [];
  let newDocuments = [];
  try {
    newCatalogs = await readFilesAsDocuments(els.partnerCatalog.files);
    newDocuments = await readFilesAsDocuments(els.partnerDocuments.files);
  } catch (error) {
    console.error("Erro ao ler arquivos:", error);
    alert("Erro ao ler arquivos");
  }
  
  const partner = {
    id,
    name: els.partnerName.value.trim(),
    type: els.partnerType.value.trim(),
    city: els.partnerCity.value.trim(),
    contact: els.partnerContact.value.trim(),
    notes: els.partnerNotes.value.trim(),
    siteUrl: normalizeUrl(els.partnerSite.value),
    mecUrl: normalizeUrl(els.partnerMecUrl.value),
    contractFileName: contractFile?.name || currentContractFileName,
    contractDataUrl,
    catalogFileName: "",
    catalogDataUrl: "",
    catalogs: mergeUniqueDocuments(existing?.catalogs || [], newCatalogs),
    documents: mergeUniqueDocuments(existing?.documents || [], newDocuments),
    contractText: existing?.contractText || DEFAULT_CONTRACT_TEXT,
  };

  if (existing) {
    Object.assign(existing, partner);
  } else {
    state.data.partners.push(partner);
    state.selectedPartnerId = id;
  }

  saveData();
  render();
}

function deletePartner(partnerId) {
  const courseIds = state.data.courses
    .filter((course) => course.partnerId === partnerId)
    .map((course) => course.id);

  state.data.partners = state.data.partners.filter((partner) => partner.id !== partnerId);
  state.data.courses = state.data.courses.filter((course) => course.partnerId !== partnerId);
  state.data.sales = state.data.sales.filter((sale) => !courseIds.includes(sale.courseId));

  if (state.selectedPartnerId === partnerId) {
    state.selectedPartnerId = "all";
  }

  if (state.salesPartnerId === partnerId) {
    state.salesPartnerId = "";
  }

  if (courseIds.includes(state.salesCourseId)) {
    state.salesCourseId = "";
  }

  saveData();
  render();
}

async function upsertCourse() {
  const id = els.courseId.value || createId("course");
  const existing = state.data.courses.find((course) => course.id === id);
  const examFile = els.courseExamFile.files[0];
  
  let examDataUrl = existing?.examDataUrl || "";
  if (examFile) {
    try {
      examDataUrl = await readFileAsDataUrl(examFile);
    } catch (error) {
      console.error("Erro ao ler prova:", error);
      alert("Erro ao ler arquivo da prova");
    }
  }
  
  const course = {
    id,
    partnerId: els.coursePartner.value,
    name: els.courseName.value.trim(),
    type: els.courseType.value || getCourseTypeFromModality(els.courseModality.value),
    modality: els.courseModality.value,
    area: existing?.area || "",
    cost: Number(els.courseCost.value),
    sale: Number(els.courseSale.value),
    transfer: els.courseTransfer.value.trim(),
    deadline: els.courseDeadline.value.trim(),
    responsible: els.courseResponsible.value.trim(),
    diplomas: els.courseDiplomas.value.trim(),
    examFileName: examFile?.name || existing?.examFileName || "",
    examDataUrl,
    notes: els.courseNotes.value.trim(),
  };

  if (existing) {
    Object.assign(existing, course);
  } else {
    state.data.courses.push(course);
  }

  saveData();
  render();
}

function upsertSale({ sync = true } = {}) {
  const id = els.saleId.value || createId("sale");
  els.saleId.value = id;
  const existing = state.data.sales.find((sale) => sale.id === id);
  const sale = {
    id,
    courseId: els.saleCourse.value,
    date: els.saleDate.value,
    student: els.saleStudent.value.trim(),
    status: els.saleStatus.value,
    seller: els.saleSeller.value.trim(),
    payment: els.salePayment.value.trim(),
    quantity: els.saleQuantity.value.trim(),
    cost: Number(els.saleCost.value),
    price: Number(els.salePrice.value),
    commission: Number(els.saleCommission.value || 0),
  };

  if (existing) {
    Object.assign(existing, sale);
  } else {
    state.data.sales.push(sale);
  }

  saveData({ sync });
  render();
  return sale;
}

function upsertExpense() {
  const id = els.expenseId.value || createId("expense");
  const existing = state.data.expenses.find((expense) => expense.id === id);
  const expense = {
    id,
    date: els.expenseDate.value,
    type: els.expenseType.value,
    description: els.expenseDescription.value.trim(),
    amount: Number(els.expenseAmount.value),
    notes: els.expenseNotes.value.trim(),
  };

  if (existing) {
    Object.assign(existing, expense);
  } else {
    state.data.expenses.push(expense);
  }

  saveData();
  render();
}

els.addCourseBtn.addEventListener("click", () => openCourseDialog());
els.addSaleBtn.addEventListener("click", () => openSaleDialog());
els.addExpenseBtn.addEventListener("click", () => openExpenseDialog());
els.addClientBtn.addEventListener("click", () => openClientDialog());

const addSaleBtnQuick = document.querySelector("#addSaleBtnQuick");
if (addSaleBtnQuick) addSaleBtnQuick.addEventListener("click", () => openSaleDialog());

if (els.addPartnerBtnQuick) {
  els.addPartnerBtnQuick.addEventListener("click", () => openPartnerDialog());
}
if (els.addPartnerBtnMobile) {
  els.addPartnerBtnMobile.addEventListener("click", () => openPartnerDialog());
}

els.profileButton.addEventListener("click", openProfileDialog);

els.profileName.addEventListener("input", () => {
  els.profilePreviewName.textContent = els.profileName.value.trim() || getEffectiveProfile().displayName;
});

els.profilePhotoUrl.addEventListener("input", () => {
  const profile = {
    displayName: els.profileName.value.trim() || getEffectiveProfile().displayName,
    avatarUrl: els.profilePhotoUrl.value.trim(),
  };
  renderAvatar(els.profilePreviewAvatar, profile);
});

function isProfilePhotoImage(file) {
  if (!file) return false;
  if (file.type?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(file.name || "");
}

els.profilePhotoFile.addEventListener("change", async () => {
  const file = els.profilePhotoFile.files[0];
  if (!file) return;
  if (!isProfilePhotoImage(file)) {
    alert("Escolha apenas arquivos de imagem para a foto do perfil.");
    els.profilePhotoFile.value = "";
    return;
  }
  try {
    const url = await readFileAsDataUrl(file);
    const profile = {
      displayName: els.profileName.value.trim() || getEffectiveProfile().displayName,
      avatarUrl: url
    };
    renderAvatar(els.profilePreviewAvatar, profile);
  } catch (error) {
    console.error("Erro ao carregar foto:", error);
    alert("Erro ao carregar foto. Tente novamente.");
    els.profilePhotoFile.value = "";
  }
});

const removeProfilePhotoBtn = document.getElementById("removeProfilePhotoBtn");
if (removeProfilePhotoBtn) {
  removeProfilePhotoBtn.addEventListener("click", () => {
    els.profilePhotoUrl.value = "";
    els.profilePhotoFile.value = "";
    const profile = {
      displayName: els.profileName.value.trim() || getEffectiveProfile().displayName,
      avatarUrl: ""
    };
    renderAvatar(els.profilePreviewAvatar, profile);
  });
}

els.addMarketingBtn.addEventListener("click", () => {
  els.marketingCategory.value = "Venda";
  els.marketingDescription.value = "";
  els.marketingFiles.value = "";
  els.marketingDialog.showModal();
});

els.removePartnerContract.addEventListener("click", () => {
  const partner = getPartner(els.partnerId.value);
  if (partner) {
    partner.contractFileName = "";
    partner.contractDataUrl = "";
  }
  els.partnerContract.value = "";
  els.partnerContractStatus.textContent = "Nenhum contrato salvo.";
  els.removePartnerContract.style.display = "none";
  saveData();
  renderPartnerEditAttachments(partner);
});

els.removeCourseExam.addEventListener("click", () => {
  const course = getCourse(els.courseId.value);
  if (course) {
    course.examFileName = "";
    course.examDataUrl = "";
  }
  els.courseExamFile.value = "";
  els.courseExamStatus.textContent = "Nenhuma prova salva.";
  els.removeCourseExam.style.display = "none";
  saveData();
  renderCourses();
});

els.courseExamFile.addEventListener("change", () => {
  const file = els.courseExamFile.files[0];
  if (file) {
    els.courseExamStatus.innerHTML = `Nova prova selecionada: <span style="font-weight: 600; color: var(--ink);">${escapeHtml(file.name)}</span>`;
    els.removeCourseExam.style.display = "inline-flex";
  } else {
    const course = getCourse(els.courseId.value);
    if (course?.examFileName) {
      els.courseExamStatus.innerHTML = `Prova salva: <a href="#" id="viewCourseExamLink" class="file-link" style="color: var(--brand); text-decoration: underline; cursor: pointer; font-weight: 600;">${escapeHtml(course.examFileName)}</a>`;
      els.removeCourseExam.style.display = "inline-flex";
      const link = document.getElementById("viewCourseExamLink");
      if (link) {
        link.addEventListener("click", (e) => {
          e.preventDefault();
          if (course.examDataUrl) {
            openSavedDocument(course.examDataUrl);
          }
        });
      }
    } else {
      els.courseExamStatus.textContent = "Nenhuma prova salva.";
      els.removeCourseExam.style.display = "none";
    }
  }
});

els.partnerContract.addEventListener("change", () => {
  const file = els.partnerContract.files[0];
  if (file) {
    els.partnerContractStatus.innerHTML = `Novo contrato selecionado: <span style="font-weight: 600; color: var(--ink);">${escapeHtml(file.name)}</span>`;
    els.removePartnerContract.style.display = "inline-flex";
  } else {
    const partner = getPartner(els.partnerId.value);
    if (partner?.contractFileName) {
      els.partnerContractStatus.innerHTML = `Contrato salvo: <a href="#" id="viewPartnerContractLink" class="file-link" style="color: var(--brand); text-decoration: underline; cursor: pointer; font-weight: 600;">${escapeHtml(partner.contractFileName)}</a>`;
      els.removePartnerContract.style.display = "inline-flex";
      const link = document.getElementById("viewPartnerContractLink");
      if (link) {
        link.addEventListener("click", (e) => {
          e.preventDefault();
          if (partner.contractDataUrl) {
            openSavedDocument(partner.contractDataUrl);
          }
        });
      }
    } else {
      els.partnerContractStatus.textContent = "Nenhum contrato salvo.";
      els.removePartnerContract.style.display = "none";
    }
  }
});

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.loginMessage.textContent = "Entrando...";
  localStorage.setItem(REMEMBER_LOGIN_KEY, String(els.rememberLogin.checked));
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: els.loginEmail.value.trim(),
    password: els.loginPassword.value,
  });
  els.loginMessage.textContent = error ? "E-mail ou senha incorretos." : "";
});

document.querySelector("#googleLoginBtn")?.addEventListener("click", async () => {
  els.loginMessage.textContent = "Redirecionando para Google...";
  await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin }
  });
});

els.rememberLogin.checked = localStorage.getItem(REMEMBER_LOGIN_KEY) !== "false";

els.logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  setSyncStatus("Aguardando login");
});

els.profileForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();

  try {
    const file = els.profilePhotoFile.files[0];
    if (file && !isProfilePhotoImage(file)) {
      alert("Escolha apenas arquivos de imagem para a foto do perfil.");
      els.profilePhotoFile.value = "";
      return;
    }
    const uploadedPhotoUrl = file ? await readFileAsDataUrl(file) : "";
    state.data.profile = {
      displayName: els.profileName.value.trim(),
      avatarUrl: uploadedPhotoUrl || els.profilePhotoUrl.value.trim(),
    };
    saveData();
    renderProfile();
    els.profileDialog.close();
    
    const result = await saveDataToCloud();
    if (!result.ok) {
      setSyncStatus("Erro ao salvar perfil online", "error");
    }
  } catch (error) {
    console.error("Erro ao salvar foto:", error);
    alert("Erro ao salvar foto. Tente novamente.");
  }
});

document.querySelector("#profileAdminPanelBtn")?.addEventListener("click", () => {
  els.profileDialog.close();
  openAdminPanel();
});

const partnerSearchFull = document.querySelector("#partnerSearchFull");
if (partnerSearchFull) {
  partnerSearchFull.addEventListener("input", () => {
    state.partnerPage = 1;
    renderPartnersFull();
  });
}

els.courseSearch.addEventListener("input", (event) => {
  state.courseSearch = event.target.value;
  state.coursePage = 1;
  renderCourses();
});

document.querySelectorAll(".modality-card").forEach((card) => {
  card.addEventListener("click", () => {
    state.courseType = card.dataset.courseType || "";
    state.modality = "";
    state.coursePage = 1;
    render();
  });
});

document.querySelectorAll(".modality-filter-card").forEach((card) => {
  card.addEventListener("click", () => {
    state.modality = card.dataset.modality || "";
    state.coursePage = 1;
    render();
  });
});

document.querySelectorAll("[data-modality-all]").forEach((card) => {
  card.addEventListener("click", () => {
    state.courseType = "";
    state.modality = "";
    state.coursePage = 1;
    render();
  });
});

els.courseType.addEventListener("change", () => {
  updateCourseModalityOptions();
});

els.courseModality.addEventListener("change", () => {
  const computedType = getCourseTypeFromModality(els.courseModality.value);
  if (computedType && els.courseType.value !== computedType) {
    els.courseType.value = computedType;
  }
});

els.courseSort.addEventListener("change", (event) => {
  state.courseSort = event.target.value;
  state.coursePage = 1;
  renderCourses();
});

const sortHeaders = [
  { id: "headerSortCurso", asc: "name-asc", desc: "name-desc" },
  { id: "headerSortTipo", asc: "type-asc", desc: "type-desc" },
  { id: "headerSortModalidade", asc: "modality-asc", desc: "modality-desc" },
  { id: "headerSortParceira", asc: "partner-asc", desc: "partner-desc" },
  { id: "headerSortValor", asc: "sale-desc", desc: "sale-asc" }
];

sortHeaders.forEach(({ id, asc, desc }) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("click", () => {
      if (state.courseSort === asc) {
        state.courseSort = desc;
      } else {
        state.courseSort = asc;
      }
      if (els.courseSort.querySelector(`option[value="${state.courseSort}"]`)) {
        els.courseSort.value = state.courseSort;
      }
      renderCourses();
    });
  }
});

els.salesSearch.addEventListener("input", (event) => {
  state.salesSearch = event.target.value;
  renderSales();
});

els.salesStatusFilter.addEventListener("change", (event) => {
  state.salesStatus = event.target.value;
  renderSales();
});

els.salesDateFrom.addEventListener("change", (event) => {
  state.salesDateFrom = event.target.value;
  state.salesMonth = "";
  els.salesMonth.value = "";
  renderSales();
});

els.salesDateTo.addEventListener("change", (event) => {
  state.salesDateTo = event.target.value;
  state.salesMonth = "";
  els.salesMonth.value = "";
  renderSales();
});

els.salesMonth.addEventListener("change", (event) => {
  state.salesMonth = event.target.value;
  state.salesDateFrom = "";
  state.salesDateTo = "";
  els.salesDateFrom.value = "";
  els.salesDateTo.value = "";
  renderSales();
});

els.salesSellerFilter.addEventListener("change", (event) => {
  state.salesSeller = event.target.value;
  renderSales();
});

els.salesPaymentFilter.addEventListener("change", (event) => {
  state.salesPayment = event.target.value;
  renderSales();
});

els.salesPartnerFilter.addEventListener("change", (event) => {
  state.salesPartnerId = event.target.value;
  renderSales();
});

els.salesCourseFilter.addEventListener("change", (event) => {
  state.salesCourseId = event.target.value;
  renderSales();
});

els.clearSalesFiltersBtn.addEventListener("click", () => {
  state.salesSearch = "";
  state.salesStatus = "";
  state.salesDateFrom = "";
  state.salesDateTo = "";
  state.salesMonth = "";
  state.salesSeller = "";
  state.salesPayment = "";
  state.salesPartnerId = "";
  state.salesCourseId = "";
  els.salesSearch.value = "";
  els.salesStatusFilter.value = "";
  els.salesDateFrom.value = "";
  els.salesDateTo.value = "";
  els.salesMonth.value = "";
  render();
});

els.saleCourse.addEventListener("change", syncSaleValuesFromCourse);

els.saleCourseSearch.addEventListener("input", (event) => {
  renderSaleCourseOptions(event.target.value, "");
});

els.saleForm.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
  }
});

els.saleDialog.addEventListener("cancel", (event) => {
  if (saleSaveInProgress) event.preventDefault();
});

els.saleCommissionPercent.addEventListener("input", () => {
  commissionLastEdited = "percent";
  updateCommissionValueFromPercent();
});

els.saleCommission.addEventListener("input", () => {
  commissionLastEdited = "value";
  updateCommissionPercentFromValue();
});

els.salePrice.addEventListener("input", updateCommissionFromLastEdited);
els.saleCost.addEventListener("input", updateCommissionFromLastEdited);

els.expenseSearch.addEventListener("input", (event) => {
  state.expenseSearch = event.target.value;
  renderExpenses();
});

els.expenseTypeFilter.addEventListener("change", (event) => {
  state.expenseType = event.target.value;
  renderExpenses();
});

els.marketingSearch.addEventListener("input", (event) => {
  state.marketingSearch = event.target.value;
  renderMarketing();
});

els.marketingCategoryFilter.addEventListener("change", (event) => {
  state.marketingCategory = event.target.value;
  renderMarketing();
});

els.mainTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.mainView = tab.dataset.mainView;
    render();
  });
});

document.querySelectorAll(".sidebar-item[data-sidebar-view]").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    const view = item.dataset.sidebarView;
    if (view === "admin") {
      if (isAdmin()) openAdminPanel();
      return;
    }
    if (view && view !== "settings") {
      state.mainView = view;
      render();
    }
    document.querySelectorAll(".sidebar-item").forEach(s => s.classList.remove("active"));
    item.classList.add("active");
  });
});

(function initSidebarDrag() {
  const menu = document.querySelector(".sidebar-menu");
  if (!menu) return;
  const items = Array.from(menu.querySelectorAll(".sidebar-item"));
  let dragItem = null;

  function saveOrder() {
    const order = Array.from(menu.querySelectorAll(".sidebar-item"))
      .map(el => el.dataset.sidebarView);
    localStorage.setItem("sidebarOrder", JSON.stringify(order));
  }

  function restoreOrder() {
    try {
      const order = JSON.parse(localStorage.getItem("sidebarOrder"));
      if (!Array.isArray(order)) return;
      const map = {};
      menu.querySelectorAll(".sidebar-item").forEach(el => { map[el.dataset.sidebarView] = el; });
      order.forEach(view => { if (map[view]) menu.appendChild(map[view]); });
    } catch (_) {}
  }

  restoreOrder();

  items.forEach(item => {
    item.setAttribute("draggable", "true");

    item.addEventListener("dragstart", (e) => {
      dragItem = item;
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "");
    });

    item.addEventListener("dragend", () => {
      if (dragItem) dragItem.classList.remove("dragging");
      dragItem = null;
      menu.querySelectorAll(".sidebar-item").forEach(el => el.classList.remove("drag-over"));
      saveOrder();
    });

    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragItem && dragItem !== item) {
        item.classList.add("drag-over");
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          menu.insertBefore(dragItem, item);
        } else {
          menu.insertBefore(dragItem, item.nextSibling);
        }
      }
    });

    item.addEventListener("dragleave", () => {
      item.classList.remove("drag-over");
    });

    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.classList.remove("drag-over");
    });
  });
})();

els.partnerForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();

  if (event.submitter?.value === "delete") {
    deletePartner(els.partnerId.value);
    els.partnerDialog.close();
    return;
  }

  if (partnerSaveInProgress) return;
  partnerSaveInProgress = true;
  const saveButton = event.submitter;
  saveButton.disabled = true;
  saveButton.textContent = "Salvando...";
  els.partnerDialog.close();

  try {
    await upsertPartner();
    setSyncStatus("Salvando parceria online...", "saving");
    const result = await saveDataToCloud();
    if (result.ok) {
      setSyncStatus("Parceria salva online", "saved");
    } else {
      setSyncStatus("Erro ao salvar parceria online", "error");
    }
  } catch (error) {
    console.error(error);
    setSyncStatus("Erro ao salvar parceria", "error");
  } finally {
    partnerSaveInProgress = false;
    saveButton.disabled = false;
    saveButton.textContent = "Salvar";
  }
});

els.clientForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();

  if (event.submitter?.value === "delete") {
    state.data.clients = state.data.clients.filter((c) => c.id !== els.clientId.value);
    saveData();
    els.clientDialog.close();
    renderClients();
    return;
  }
  const existing = state.data.clients.find((c) => c.id === els.clientId.value);
  const client = {
    id: els.clientId.value || createId("client"),
    name: els.clientName.value.trim(),
    cpf: els.clientCpf.value.trim(),
    phone: els.clientPhone.value.trim(),
    email: els.clientEmail.value.trim(),
    partnerId: els.clientPartner.value,
    courseId: els.clientCourse.value,
    contractFileName: existing?.contractFileName || "",
    contractDataUrl: existing?.contractDataUrl || "",
    historyFileName: existing?.historyFileName || "",
    historyDataUrl: existing?.historyDataUrl || "",
    declarationFileName: existing?.declarationFileName || "",
    declarationDataUrl: existing?.declarationDataUrl || "",
    diplomaFileName: existing?.diplomaFileName || "",
    diplomaDataUrl: existing?.diplomaDataUrl || "",
  };

  if (els.clientContractFile.files[0]) {
    try {
      const file = els.clientContractFile.files[0];
      client.contractFileName = file.name;
      client.contractDataUrl = await readFileAsDataUrl(file);
    } catch (error) {
      console.error("Erro ao ler contrato:", error);
      alert("Erro ao ler arquivo do contrato");
    }
  }
  if (els.clientHistoryFile.files[0]) {
    try {
      const file = els.clientHistoryFile.files[0];
      client.historyFileName = file.name;
      client.historyDataUrl = await readFileAsDataUrl(file);
    } catch (error) {
      console.error("Erro ao ler histórico:", error);
      alert("Erro ao ler arquivo do histórico");
    }
  }
  if (els.clientDeclarationFile.files[0]) {
    try {
      const file = els.clientDeclarationFile.files[0];
      client.declarationFileName = file.name;
      client.declarationDataUrl = await readFileAsDataUrl(file);
    } catch (error) {
      console.error("Erro ao ler declaração:", error);
      alert("Erro ao ler arquivo da declaração");
    }
  }
  if (els.clientDiplomaFile.files[0]) {
    try {
      const file = els.clientDiplomaFile.files[0];
      client.diplomaFileName = file.name;
      client.diplomaDataUrl = await readFileAsDataUrl(file);
    } catch (error) {
      console.error("Erro ao ler diploma:", error);
      alert("Erro ao ler arquivo do diploma");
    }
  }

  const index = state.data.clients.findIndex((c) => c.id === client.id);
  if (index >= 0) state.data.clients[index] = client;
  else state.data.clients.push(client);
  
  saveData();
  els.clientDialog.close();
  renderClients();
  
  setSyncStatus("Salvando cliente online...", "saving");
  const result = await saveDataToCloud();
  if (result.ok) {
    setSyncStatus("Cliente salvo online", "saved");
  } else {
    setSyncStatus("Erro ao salvar cliente online", "error");
  }
});

els.clientSearch.addEventListener("input", (event) => {
  state.clientSearch = event.target.value;
  state.clientPage = 1;
  renderClients();
});

els.clientPartner.addEventListener("change", () => {
  const partnerId = els.clientPartner.value;
  els.clientCourse.innerHTML = state.data.courses
    .filter((c) => c.partnerId === partnerId)
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
    .join("");
});

els.courseForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();

  if (event.submitter?.value === "delete") {
    state.data.courses = state.data.courses.filter((course) => course.id !== els.courseId.value);
    state.data.sales = state.data.sales.filter((sale) => sale.courseId !== els.courseId.value);
    saveData();
    render();
    els.courseDialog.close();
    return;
  }

  await upsertCourse();
  els.courseDialog.close();
  
  setSyncStatus("Salvando curso online...", "saving");
  const result = await saveDataToCloud();
  if (result.ok) {
    setSyncStatus("Curso salvo online", "saved");
  } else {
    setSyncStatus("Erro ao salvar curso online", "error");
  }
});

els.saleForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") {
    if (saleSaveInProgress) event.preventDefault();
    return;
  }
  event.preventDefault();
  if (saleSaveInProgress) return;
  saleSaveInProgress = true;
  const action = event.submitter?.value === "delete" ? "delete" : "save";
  setSaleFormLocked(true, action);

  try {
    if (event.submitter?.value === "delete") {
      const saleId = els.saleId.value;
      els.saleFormMessage.textContent = "Excluindo a venda do banco online...";
      const saleResult = await deleteSaleFromCloud(saleId);
      if (!saleResult.ok) {
        els.saleFormMessage.textContent = `Nao foi possivel excluir a venda online: ${saleResult.error}`;
        return;
      }
      state.data.sales = state.data.sales.filter((sale) => sale.id !== saleId);
      saveData({ sync: false });
      render();
      setSyncStatus("Venda excluida online", "saved");
      els.saleDialog.close();
      return;
    }

    els.saleFormMessage.textContent = "Confirmando a venda no banco online...";
    const sale = upsertSale({ sync: false });
    const saleResult = await saveSaleToCloud(sale);

    if (saleResult.ok) {
      setSyncStatus("Venda salva online", "saved");
      els.saleDialog.close();
      return;
    }

    els.saleFormMessage.textContent =
      `Nao foi possivel salvar a venda online: ${saleResult.error}. Execute novamente o arquivo supabase-setup.sql.`;
  } finally {
    saleSaveInProgress = false;
    setSaleFormLocked(false);
  }
});

els.expenseForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();

  if (event.submitter?.value === "delete") {
    state.data.expenses = state.data.expenses.filter((expense) => expense.id !== els.expenseId.value);
    saveData();
    render();
    els.expenseDialog.close();
    return;
  }

  upsertExpense();
  els.expenseDialog.close();
  
  setSyncStatus("Salvando custo online...", "saving");
  const result = await saveDataToCloud();
  if (result.ok) {
    setSyncStatus("Custo salvo online", "saved");
  } else {
    setSyncStatus("Erro ao salvar custo online", "error");
  }
});

els.marketingForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();

  const files = await readFilesAsDocuments(els.marketingFiles.files);
  files.forEach((file) => {
    state.data.marketing.push({
      ...file,
      category: els.marketingCategory.value,
      description: els.marketingDescription.value.trim(),
    });
  });
  saveData();
  render();
  els.marketingDialog.close();
});

(function initTheme() {
  const THEME_KEY = "educamais_theme";
  const body = document.body;
  const docHtml = document.documentElement;
  const buttons = document.querySelectorAll(".theme-btn, .theme-btn-mobile");

  function applyTheme(theme) {
    if (theme === "dark") {
      body.classList.add("dark-theme");
      docHtml.classList.add("dark-theme");
    } else {
      body.classList.remove("dark-theme");
      docHtml.classList.remove("dark-theme");
    }
    buttons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.theme === theme);
    });
    localStorage.setItem(THEME_KEY, theme);
  }

  // Load saved theme or default
  const savedTheme = localStorage.getItem(THEME_KEY) || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(savedTheme);

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      applyTheme(btn.dataset.theme);
    });
  });
})();

render();
initializeCloud();

// RESPONSIVIDADE MOBILE GLOBALS & EVENTOS
(function initMobileMenu() {
  const hamburgerBtn = document.querySelector("#hamburgerBtn");
  const appSidebar = document.querySelector("#appSidebar");
  const sidebarOverlay = document.querySelector("#sidebarOverlay");
  const sidebarCloseBtn = document.querySelector("#sidebarCloseBtn");
  const sidebarItems = document.querySelectorAll(".sidebar-item");

  function closeMobileMenu() {
    if (appSidebar) appSidebar.classList.remove("open");
    if (sidebarOverlay) {
      sidebarOverlay.classList.remove("visible");
      sidebarOverlay.classList.remove("open");
    }
  }

  if (hamburgerBtn && appSidebar) {
    hamburgerBtn.addEventListener("click", () => {
      appSidebar.classList.add("open");
      if (sidebarOverlay) {
        sidebarOverlay.classList.add("visible");
        sidebarOverlay.classList.add("open");
      }
    });
  }

  if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener("click", closeMobileMenu);
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeMobileMenu);
  }

  // Clicar em uma aba fecha o menu automaticamente
  sidebarItems.forEach((item) => {
    item.addEventListener("click", closeMobileMenu);
  });

  // Fechar menu com tecla ESC
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeMobileMenu();
    }
  });

  // Ações Rápidas Mobile
  const mobileLogoutBtn = document.querySelector("#mobileLogoutBtn");

  if (mobileLogoutBtn) {
    mobileLogoutBtn.addEventListener("click", () => {
      closeMobileMenu();
      if (els.logoutBtn) {
        els.logoutBtn.click();
      }
    });
  }
})();
