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
  mainView: "courses",
  selectedPartnerId: "all",
  courseView: "general",
  partnerSearch: "",
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
  salesCourseId: "",
  expenseSearch: "",
  expenseType: "",
  selectedContractPartnerId: "",
  examSearch: "",
  marketingSearch: "",
  marketingCategory: "",
  summaryMonth: today().slice(0, 7),
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
  prevSummaryMonth: document.querySelector("#prevSummaryMonth"),
  nextSummaryMonth: document.querySelector("#nextSummaryMonth"),
  summaryMonthPicker: document.querySelector("#summaryMonthPicker"),
  summaryMonthLabel: document.querySelector("#summaryMonthLabel"),
  partnerCount: document.querySelector("#partnerCount"),
  courseCount: document.querySelector("#courseCount"),
  salesCount: document.querySelector("#salesCount"),
  totalProfit: document.querySelector("#totalProfit"),
  partnerSidebar: document.querySelector("#partnerSidebar"),
  coursesView: document.querySelector("#coursesView"),
  salesView: document.querySelector("#salesView"),
  partnerList: document.querySelector("#partnerList"),
  partnerSearch: document.querySelector("#partnerSearch"),
  courseSearch: document.querySelector("#courseSearch"),
  modalityFilter: document.querySelector("#modalityFilter"),
  courseSort: document.querySelector("#courseSort"),
  courseRows: document.querySelector("#courseRows"),
  emptyState: document.querySelector("#emptyState"),
  selectedPartner: document.querySelector("#selectedPartner"),
  mainTabs: document.querySelectorAll("[data-main-view]"),
  courseTabs: document.querySelectorAll("[data-course-view]"),
  addPartnerBtn: document.querySelector("#addPartnerBtn"),
  addCourseBtn: document.querySelector("#addCourseBtn"),
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
  contractsView: document.querySelector("#contractsView"),
  examsView: document.querySelector("#examsView"),
  marketingView: document.querySelector("#marketingView"),
  contractPartnerSelect: document.querySelector("#contractPartnerSelect"),
  contractTextEditor: document.querySelector("#contractTextEditor"),
  openContractPdfBtn: document.querySelector("#openContractPdfBtn"),
  saveContractTextBtn: document.querySelector("#saveContractTextBtn"),
  printContractBtn: document.querySelector("#printContractBtn"),
  partnerDocumentsList: document.querySelector("#partnerDocumentsList"),
  partnerCatalogsList: document.querySelector("#partnerCatalogsList"),
  exportDataBtn: document.querySelector("#exportDataBtn"),
  importDataInput: document.querySelector("#importDataInput"),
  examSearch: document.querySelector("#examSearch"),
  examCourseList: document.querySelector("#examCourseList"),
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

function renderProfile() {
  const profile = getEffectiveProfile();
  els.sidebarUserName.textContent = profile.displayName;
  renderAvatar(els.sidebarUserAvatar, profile);

  if (els.profileDialog.open) {
    els.profilePreviewName.textContent = profile.displayName;
    renderAvatar(els.profilePreviewAvatar, profile);
  }
}

function openProfileDialog() {
  const profile = getEffectiveProfile();
  els.profileName.value = profile.displayName;
  els.profilePhotoUrl.value = state.data.profile?.avatarUrl || "";
  els.profilePhotoFile.value = "";
  els.profilePreviewName.textContent = profile.displayName;
  renderAvatar(els.profilePreviewAvatar, profile);
  els.profileDialog.showModal();
}

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
  data.imports ||= {};
  data.profile ||= {};
  data.profile.displayName ||= "";
  data.profile.avatarUrl ||= "";
  mergeEduMaisCatalog(data);
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

function saveData({ sync = true } = {}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  } catch (error) {
    console.warn("Nao foi possivel atualizar a copia local.", error);
    setSyncStatus("Salvando somente online", "saving");
  }
  if (sync) scheduleCloudSave();
}

function setSyncStatus(message, status = "") {
  els.syncStatus.textContent = message;
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
  cloudSaveTimer = setTimeout(saveDataToCloud, 600);
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
      } catch (localError) {
        console.warn("A copia local esta cheia. Os dados continuarao online.", localError);
      }
    } else {
      const { error: insertError } = await supabaseClient
        .from("crm_state")
        .insert({ user_id: cloudUser.id, data: state.data });
      if (insertError) {
        setSyncStatus(`Erro ao criar dados online: ${insertError.message}`, "error");
        return;
      }
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
    renderProfile();
    els.loginScreen.classList.toggle("hidden", Boolean(cloudUser));
    if (cloudUser) await loadDataFromCloud();
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
    if (userChanged) cloudReady = false;
    els.loginScreen.classList.toggle("hidden", Boolean(cloudUser));
    if (cloudUser && !cloudReady) {
      setAppLoading(true);
      setTimeout(async () => {
        await loadDataFromCloud();
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
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
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

function downloadTextFile(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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
    const viewMatch = state.courseView === "general" || course.partnerId === state.selectedPartnerId;
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

  els.summaryMonthPicker.value = state.summaryMonth;
  els.summaryMonthLabel.textContent = formatMonthLabel(state.summaryMonth);
  els.partnerCount.textContent = state.data.partners.length;
  els.courseCount.textContent = state.data.courses.length;
  els.salesCount.textContent = totals.salesCount;
  els.totalProfit.textContent = formatMoney(totals.netProfit);
}

function renderMainView() {
  const showingCourses = state.mainView === "courses";
  const showingSales = state.mainView === "sales";
  const showingCosts = state.mainView === "costs";
  const showingContracts = state.mainView === "contracts";
  const showingExams = state.mainView === "exams";
  const showingMarketing = state.mainView === "marketing";
  els.coursesView.hidden = !showingCourses;
  els.salesView.hidden = !showingSales;
  els.costsView.hidden = !showingCosts;
  els.contractsView.hidden = !showingContracts;
  els.examsView.hidden = !showingExams;
  els.marketingView.hidden = !showingMarketing;
  els.partnerSidebar.classList.toggle("hidden", !showingCourses);

  els.mainTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mainView === state.mainView);
  });

  document.querySelectorAll(".sidebar-item[data-sidebar-view]").forEach((item) => {
    item.classList.toggle("active", item.dataset.sidebarView === state.mainView);
  });
}

function renderPartners() {
  const partners = state.data.partners.filter((partner) => {
    return (
      !state.partnerSearch ||
      matchesSearch(
        [partner.name, partner.type, partner.city, partner.contact, partner.notes, partner.siteUrl, partner.mecUrl],
        state.partnerSearch
      )
    );
  });

  els.partnerList.innerHTML = "";

  const allButton = document.createElement("button");
  allButton.className = `partner-item ${state.selectedPartnerId === "all" ? "active" : ""}`;
  allButton.type = "button";
  allButton.innerHTML = `<strong>Todos os cursos</strong><span>Plano geral com todas as parcerias</span>`;
  allButton.addEventListener("click", () => {
    state.selectedPartnerId = "all";
    state.courseView = "general";
    render();
  });
  els.partnerList.appendChild(allButton);

  partners.forEach((partner) => {
    const courseTotal = state.data.courses.filter((course) => course.partnerId === partner.id).length;
    const button = document.createElement("button");
    button.className = `partner-item ${state.selectedPartnerId === partner.id ? "active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <strong>${escapeHtml(partner.name)}</strong>
      <span>${escapeHtml(partner.type || "Parceria")} - ${escapeHtml(partner.city || "Sem cidade")} - ${courseTotal} curso(s)</span>
    `;
    button.addEventListener("click", () => {
      state.selectedPartnerId = partner.id;
      state.courseView = "partner";
      render();
    });
    els.partnerList.appendChild(button);
  });
}

function renderSelectedPartner() {
  const partner = getPartner(state.selectedPartnerId);
  const show = state.courseView === "partner" && partner;
  els.selectedPartner.classList.toggle("visible", Boolean(show));

  if (!show) {
    els.selectedPartner.innerHTML = "";
    return;
  }

  els.selectedPartner.innerHTML = `
    <div>
      <h2>${escapeHtml(partner.name)}</h2>
      <p>${escapeHtml(partner.type || "Parceria")} - ${escapeHtml(partner.city || "Sem cidade")} - ${escapeHtml(partner.contact || "Sem contato")}</p>
      ${partner.notes ? `<div class="partner-notes"><strong>Observacoes</strong><p>${escapeHtml(partner.notes)}</p></div>` : ""}
    </div>
    <div class="partner-actions">
      <button class="link-action" type="button" data-partner-site="${escapeHtml(partner.id)}" ${partner.siteUrl ? "" : "disabled"}>Site</button>
      <button class="link-action" type="button" data-partner-mec="${escapeHtml(partner.id)}" ${partner.mecUrl ? "" : "disabled"}>MEC</button>
      <button class="link-action" type="button" data-partner-contract="${escapeHtml(partner.id)}" ${partner.contractDataUrl ? "" : "disabled"}>Contrato</button>
      <button class="link-action" type="button" data-partner-catalog="${escapeHtml(partner.id)}" ${partner.catalogs.length ? "" : "disabled"}>Catalogos</button>
      <button class="link-action" type="button" data-partner-documents="${escapeHtml(partner.id)}" ${partner.documents.length ? "" : "disabled"}>Documentos</button>
      <button class="secondary-action" type="button" id="editPartnerBtn">Editar parceria</button>
    </div>
  `;
  document.querySelector("#editPartnerBtn").addEventListener("click", () => openPartnerDialog(partner));
  document.querySelector("[data-partner-site]")?.addEventListener("click", () => {
    window.open(normalizeUrl(partner.siteUrl), "_blank", "noopener");
  });
  document.querySelector("[data-partner-mec]")?.addEventListener("click", () => {
    window.open(normalizeUrl(partner.mecUrl), "_blank", "noopener");
  });
  document.querySelector("[data-partner-contract]")?.addEventListener("click", () => {
    openSavedDocument(partner.contractDataUrl);
  });
  document.querySelector("[data-partner-catalog]")?.addEventListener("click", () => {
    state.selectedContractPartnerId = partner.id;
    state.mainView = "contracts";
    render();
  });
  document.querySelector("[data-partner-documents]")?.addEventListener("click", () => {
    state.selectedContractPartnerId = partner.id;
    state.mainView = "contracts";
    render();
  });
}

function renderCourses() {
  const courses = filteredCourses();
  els.courseRows.innerHTML = "";
  els.emptyState.classList.toggle("visible", courses.length === 0);

  courses.forEach((course) => {
    const partner = getPartner(course.partnerId);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="course-detail-cell">
        <strong>${escapeHtml(course.name)}</strong>
        <small>${escapeHtml(course.area || course.type || "")}</small>
      </td>
      <td><span class="margin-pill">${escapeHtml(course.type || getCourseTypeFromModality(course.modality))}</span></td>
      <td><span class="margin-pill">${escapeHtml(course.modality)}</span></td>
      <td>
        <strong>${escapeHtml(partner?.name || "Parceria removida")}</strong>
      </td>
      <td>${escapeHtml(course.deadline || "Nao informado")}</td>
      <td>${formatMoney(course.sale)}</td>
      <td class="action-cell">
        <button class="row-action" type="button" data-course-id="${escapeHtml(course.id)}" title="Ver detalhes">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <button class="row-action" type="button" data-sale-course-id="${escapeHtml(course.id)}" title="Adicionar venda">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        </button>
      </td>
    `;
    els.courseRows.appendChild(row);
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
      state.selectedContractPartnerId = partner?.id || "";
      state.mainView = "contracts";
      render();
    });
  });

  document.querySelectorAll("[data-course-documents]").forEach((button) => {
    button.addEventListener("click", () => {
      const partner = getPartner(button.dataset.courseDocuments);
      state.selectedContractPartnerId = partner?.id || "";
      state.mainView = "contracts";
      render();
    });
  });
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
      <td>${escapeHtml(course?.modality || "")}</td>
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

function getSelectedContractPartner() {
  return getPartner(state.selectedContractPartnerId) || state.data.partners[0] || null;
}

function renderContracts() {
  if (!getPartner(state.selectedContractPartnerId)) {
    state.selectedContractPartnerId = state.data.partners[0]?.id || "";
  }

  renderSelectOptions(
    els.contractPartnerSelect,
    state.data.partners.map((partner) => ({ value: partner.id, label: partner.name })),
    state.selectedContractPartnerId,
    "Selecione uma parceria"
  );

  const partner = getSelectedContractPartner();
  els.contractTextEditor.disabled = !partner;
  els.contractTextEditor.value = partner?.contractText || "";
  els.openContractPdfBtn.disabled = !partner?.contractDataUrl;
  els.saveContractTextBtn.disabled = !partner;
  els.printContractBtn.disabled = !partner;
  els.partnerCatalogsList.innerHTML = "";
  els.partnerDocumentsList.innerHTML = "";

  if (!partner?.catalogs.length) {
    els.partnerCatalogsList.innerHTML = `<p class="file-note">Nenhum catalogo anexado.</p>`;
  } else {
    partner.catalogs.forEach((catalog) => {
      const item = document.createElement("div");
      item.className = "document-item";
      item.innerHTML = `
        <strong>${escapeHtml(catalog.name)}</strong>
        <button class="link-action" type="button" data-open-catalog="${escapeHtml(catalog.id)}">Abrir</button>
      `;
      els.partnerCatalogsList.appendChild(item);
    });

    document.querySelectorAll("[data-open-catalog]").forEach((button) => {
      button.addEventListener("click", () => {
        const catalog = partner.catalogs.find((item) => item.id === button.dataset.openCatalog);
        openSavedDocument(catalog?.dataUrl);
      });
    });
  }

  if (!partner?.documents.length) {
    els.partnerDocumentsList.innerHTML = `<p class="file-note">Nenhum outro documento anexado.</p>`;
    return;
  }

  partner.documents.forEach((documentItem) => {
    const item = document.createElement("div");
    item.className = "document-item";
    item.innerHTML = `
      <strong>${escapeHtml(documentItem.name)}</strong>
      <button class="link-action" type="button" data-open-partner-document="${escapeHtml(documentItem.id)}">Abrir</button>
    `;
    els.partnerDocumentsList.appendChild(item);
  });

  document.querySelectorAll("[data-open-partner-document]").forEach((button) => {
    button.addEventListener("click", () => {
      const documentItem = partner.documents.find((item) => item.id === button.dataset.openPartnerDocument);
      openSavedDocument(documentItem?.dataUrl);
    });
  });
}

function renderExams() {
  const courses = state.data.courses.filter((course) => {
    const partner = getPartner(course.partnerId);
    return !state.examSearch || matchesSearch([course.name, course.modality, partner?.name], state.examSearch);
  });

  els.examCourseList.innerHTML = "";
  courses.forEach((course) => {
    const partner = getPartner(course.partnerId);
    const item = document.createElement("article");
    item.className = "exam-course-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(course.name)}</strong>
        <span>${escapeHtml(course.modality)} - ${escapeHtml(partner?.name || "Sem parceria")}</span>
        <small>${course.examFileName ? `Prova: ${escapeHtml(course.examFileName)}` : "Nenhuma prova anexada"}</small>
      </div>
      <div class="document-actions">
        <button class="link-action" type="button" data-open-exam="${escapeHtml(course.id)}" ${course.examDataUrl ? "" : "disabled"}>Abrir prova</button>
        <button class="secondary-action" type="button" data-edit-exam="${escapeHtml(course.id)}">Anexar / editar</button>
      </div>
    `;
    els.examCourseList.appendChild(item);
  });

  document.querySelectorAll("[data-open-exam]").forEach((button) => {
    button.addEventListener("click", () => openSavedDocument(getCourse(button.dataset.openExam)?.examDataUrl));
  });

  document.querySelectorAll("[data-edit-exam]").forEach((button) => {
    button.addEventListener("click", () => openCourseDialog(getCourse(button.dataset.editExam)));
  });
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

function renderCourseTabs() {
  els.courseTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.courseView === state.courseView);
  });
}

function renderCourseTypeFilters() {
  document.querySelectorAll("[data-course-type]").forEach((card) => {
    card.classList.toggle("active", normalize(card.dataset.courseType || "") === normalize(state.courseType));
  });
}

function renderCourseModalityOptions() {
  const typeGroup = getCourseTypeGroup(state.courseType);
  const modalities = typeGroup ? typeGroup.modalities : ALL_COURSE_MODALITIES;
  const selectedModality = modalities.find((modality) => isSameCourseModality(modality, state.modality));

  if (state.modality && !selectedModality) {
    state.modality = "";
  } else if (selectedModality) {
    state.modality = selectedModality;
  }

  els.modalityFilter.innerHTML = [
    `<option value="">Todas as modalidades</option>`,
    ...modalities.map((modality) => `<option value="${escapeHtml(modality)}">${escapeHtml(modality)}</option>`),
  ].join("");
  els.modalityFilter.value = state.modality;
}

function updateCourseModalityOptions() {
  const typeGroup = getCourseTypeGroup(els.courseType.value);
  const modalities = typeGroup ? typeGroup.modalities : ALL_COURSE_MODALITIES;
  const currentValue = els.courseModality.value;
  els.courseModality.innerHTML = modalities.map((m) =>
    `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`
  ).join("");
  if (modalities.includes(currentValue)) {
    els.courseModality.value = currentValue;
  } else if (modalities.length) {
    els.courseModality.value = modalities[0];
  }
}

function render() {
  if (state.courseView === "partner" && state.selectedPartnerId === "all") {
    state.courseView = "general";
  }

  renderSummary();
  renderMainView();
  renderPartners();
  renderSelectedPartner();
  renderCourseTypeFilters();
  renderCourseModalityOptions();
  renderCourses();
  renderSales();
  renderExpenses();
  renderCoursePartnerOptions();
  renderSaleCourseOptions();
  renderSalesFilterOptions();
  renderContracts();
  renderExams();
  renderMarketing();
  renderCourseTabs();
  renderProfile();
}

function openPartnerDialog(partner = null) {
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
  els.partnerContractStatus.textContent = partner?.contractFileName
    ? `Contrato salvo: ${partner.contractFileName}`
    : "Nenhum contrato salvo.";
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

function openCourseDialog(course = null) {
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
  els.courseCost.value = course?.cost ?? "";
  els.courseSale.value = course?.sale ?? "";
  els.courseTransfer.value = course?.transfer || "";
  els.courseDeadline.value = course?.deadline || "";
  els.courseResponsible.value = course?.responsible || "";
  els.courseDiplomas.value = course?.diplomas || "";
  els.courseExamFile.value = "";
  els.courseExamStatus.textContent = course?.examFileName
    ? `Prova salva: ${course.examFileName}`
    : "Nenhuma prova salva.";
  els.courseNotes.value = course?.notes || "";
  els.deleteCourse.style.visibility = course ? "visible" : "hidden";
  els.courseDialog.showModal();
}

function openSaleDialog(sale = null, selectedCourse = null) {
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
  const contractDataUrl = contractFile ? await readFileAsDataUrl(contractFile) : currentContractDataUrl;
  const newCatalogs = await readFilesAsDocuments(els.partnerCatalog.files);
  const newDocuments = await readFilesAsDocuments(els.partnerDocuments.files);
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
    state.courseView = "partner";
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
    state.courseView = "general";
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
  const examDataUrl = examFile ? await readFileAsDataUrl(examFile) : existing?.examDataUrl || "";
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

els.prevSummaryMonth.addEventListener("click", () => {
  state.summaryMonth = shiftMonth(state.summaryMonth, -1);
  renderSummary();
});

els.nextSummaryMonth.addEventListener("click", () => {
  state.summaryMonth = shiftMonth(state.summaryMonth, 1);
  renderSummary();
});

els.summaryMonthPicker.addEventListener("change", (event) => {
  state.summaryMonth = event.target.value || today().slice(0, 7);
  renderSummary();
});

els.addPartnerBtn.addEventListener("click", () => openPartnerDialog());
els.addCourseBtn.addEventListener("click", () => openCourseDialog());
els.addSaleBtn.addEventListener("click", () => openSaleDialog());
els.addExpenseBtn.addEventListener("click", () => openExpenseDialog());

const addPartnerBtnQuick = document.querySelector("#addPartnerBtnQuick");
const addSaleBtnQuick = document.querySelector("#addSaleBtnQuick");
const fabAdd = document.querySelector("#fabAdd");
if (addPartnerBtnQuick) addPartnerBtnQuick.addEventListener("click", () => openPartnerDialog());
if (addSaleBtnQuick) addSaleBtnQuick.addEventListener("click", () => openSaleDialog());
if (fabAdd) fabAdd.addEventListener("click", () => openSaleDialog());

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

els.addMarketingBtn.addEventListener("click", () => {
  els.marketingCategory.value = "Venda";
  els.marketingDescription.value = "";
  els.marketingFiles.value = "";
  els.marketingDialog.showModal();
});

els.removePartnerContract.addEventListener("click", () => {
  const partner = getPartner(els.partnerId.value);
  if (!partner) return;
  partner.contractFileName = "";
  partner.contractDataUrl = "";
  els.partnerContractStatus.textContent = "Nenhum contrato salvo.";
  saveData();
  renderPartnerEditAttachments(partner);
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

els.rememberLogin.checked = localStorage.getItem(REMEMBER_LOGIN_KEY) !== "false";

els.logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  setSyncStatus("Aguardando login");
});

els.profileForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();

  const file = els.profilePhotoFile.files[0];
  const uploadedPhotoUrl = file ? await readFileAsDataUrl(file) : "";
  state.data.profile = {
    displayName: els.profileName.value.trim(),
    avatarUrl: uploadedPhotoUrl || els.profilePhotoUrl.value.trim(),
  };
  saveData();
  renderProfile();
  els.profileDialog.close();
});

els.partnerSearch.addEventListener("input", (event) => {
  state.partnerSearch = event.target.value;
  renderPartners();
});

els.courseSearch.addEventListener("input", (event) => {
  state.courseSearch = event.target.value;
  renderCourses();
});

els.modalityFilter.addEventListener("change", (event) => {
  state.modality = event.target.value;
  renderCourses();
});

document.querySelectorAll(".modality-card").forEach((card) => {
  card.addEventListener("click", () => {
    state.courseType = card.dataset.courseType || "";
    state.modality = "";
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
  renderCourses();
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

els.contractPartnerSelect.addEventListener("change", (event) => {
  state.selectedContractPartnerId = event.target.value;
  renderContracts();
});

els.saveContractTextBtn.addEventListener("click", () => {
  const partner = getSelectedContractPartner();
  if (!partner) return;
  partner.contractText = els.contractTextEditor.value;
  saveData();
  renderContracts();
});

els.openContractPdfBtn.addEventListener("click", () => {
  openSavedDocument(getSelectedContractPartner()?.contractDataUrl);
});

els.printContractBtn.addEventListener("click", () => {
  const partner = getSelectedContractPartner();
  if (!partner) return;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(`
    <html><head><title>Contrato - ${escapeHtml(partner.name)}</title>
    <style>body{font-family:Arial,sans-serif;margin:40px;line-height:1.5}pre{white-space:pre-wrap;font:inherit}</style>
    </head><body><pre>${escapeHtml(els.contractTextEditor.value)}</pre></body></html>
  `);
  printWindow.document.close();
  printWindow.print();
});

els.exportDataBtn.addEventListener("click", () => {
  downloadTextFile(`eduacademico-backup-${today()}.json`, JSON.stringify(state.data));
});

els.importDataInput.addEventListener("change", async () => {
  const file = els.importDataInput.files[0];
  if (!file) return;
  const imported = JSON.parse(await file.text());
  state.data = imported;
  saveData();
  state.data = loadData();
  render();
  els.importDataInput.value = "";
});

els.examSearch.addEventListener("input", (event) => {
  state.examSearch = event.target.value;
  renderExams();
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
    if (view && view !== "partners" && view !== "settings") {
      state.mainView = view;
      render();
    }
    document.querySelectorAll(".sidebar-item").forEach(s => s.classList.remove("active"));
    item.classList.add("active");
  });
});

els.courseTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.courseView = tab.dataset.courseView;
    if (state.courseView === "general") {
      state.selectedPartnerId = "all";
    } else if (state.selectedPartnerId === "all") {
      state.selectedPartnerId = state.data.partners[0]?.id || "all";
    }
    render();
  });
});

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
  } catch (error) {
    console.error(error);
    setSyncStatus("Erro ao salvar parceria", "error");
  } finally {
    partnerSaveInProgress = false;
    saveButton.disabled = false;
    saveButton.textContent = "Salvar";
  }
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

els.expenseForm.addEventListener("submit", (event) => {
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

render();
initializeCloud();

const hamburgerBtn = document.querySelector("#hamburgerBtn");
const appSidebar = document.querySelector("#appSidebar");
const sidebarOverlay = document.querySelector("#sidebarOverlay");
if (hamburgerBtn && appSidebar) {
  hamburgerBtn.addEventListener("click", () => {
    appSidebar.classList.toggle("open");
    sidebarOverlay.classList.toggle("visible");
  });
}
if (sidebarOverlay) {
  sidebarOverlay.addEventListener("click", () => {
    appSidebar.classList.remove("open");
    sidebarOverlay.classList.remove("visible");
  });
}
