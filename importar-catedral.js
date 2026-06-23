// ============================================
// FACULDADE CATEDRAL - Importação em lote
// Cole este script no console do navegador (F12 → Console)
// ============================================

(function () {
  const partnerId = "partner-faculdade-catedral";

  // Criar parceira
  const partner = {
    id: partnerId,
    name: "Faculdade Catedral",
    type: "Faculdade",
    city: "",
    contact: "",
    notes: "",
    siteUrl: "",
    mecUrl: "",
    contractFileName: "",
    contractDataUrl: "",
    catalogFileName: "",
    catalogDataUrl: "",
    catalogs: [],
    documents: [],
    contractText: "",
  };

  if (!state.data.partners.find((p) => p.id === partnerId)) {
    state.data.partners.push(partner);
  }

  const courses = [
    // === PRIMEIRA GRADUAÇÃO PRESENCIAL ===
    { name: "Pedagogia (1ª/2ª Graduação)", modality: "Licenciatura", notes: "Presencial" },
    { name: "Gestão de RH (1ª Graduação)", modality: "Tecnologo", notes: "Presencial" },

    // === PRIMEIRA GRADUAÇÃO EAD ===
    { name: "Pedagogia (1ª Graduação)", modality: "Licenciatura", notes: "EAD" },
    { name: "Ciências Sociais (1ª Graduação)", modality: "Licenciatura", notes: "EAD" },
    { name: "Artes Visuais (1ª Graduação)", modality: "Licenciatura", notes: "EAD" },
    { name: "Matemática (1ª Graduação)", modality: "Licenciatura", notes: "EAD" },
    { name: "História (1ª Graduação)", modality: "Licenciatura", notes: "EAD" },
    { name: "Letras LIBRAS (1ª Graduação)", modality: "Licenciatura", notes: "EAD" },
    { name: "Gestão de RH (1ª Graduação)", modality: "Tecnologo", notes: "EAD" },
    { name: "Gestão Financeira (1ª Graduação)", modality: "Tecnologo", notes: "EAD" },
    { name: "Gestão Serviços Jurídicos (1ª Graduação)", modality: "Tecnologo", notes: "EAD" },
    { name: "Administração (1ª Graduação)", modality: "Bacharel", notes: "EAD" },
    { name: "Ciências Contábeis (1ª Graduação)", modality: "Bacharel", notes: "EAD" },
    { name: "Teologia (1ª Graduação)", modality: "Bacharel", notes: "EAD" },
    { name: "Pedagogia EAD (1ª Graduação)", modality: "Licenciatura", notes: "EAD" },
    { name: "Administração EAD (1ª Graduação)", modality: "Bacharel", notes: "EAD" },

    // === SEGUNDA GRADUAÇÃO EAD ===
    { name: "Pedagogia (2ª Graduação)", modality: "Licenciatura", notes: "EAD - Segunda Graduação" },
    { name: "Educação Especial (2ª Graduação)", modality: "Licenciatura", notes: "EAD - Segunda Graduação" },
    { name: "Pedagogia EAD (2ª Graduação)", modality: "Licenciatura", notes: "EAD - Segunda Graduação" },
    { name: "Letras LIBRAS (2ª Graduação)", modality: "Licenciatura", notes: "EAD - Segunda Graduação" },
    { name: "Ciências Sociais (2ª Graduação)", modality: "Licenciatura", notes: "EAD - Segunda Graduação" },
    { name: "Artes Visuais (2ª Graduação)", modality: "Licenciatura", notes: "EAD - Segunda Graduação" },
    { name: "Matemática (2ª Graduação)", modality: "Licenciatura", notes: "EAD - Segunda Graduação" },
    { name: "História (2ª Graduação)", modality: "Licenciatura", notes: "EAD - Segunda Graduação" },
  ];

  let added = 0;
  courses.forEach((c) => {
    const exists = state.data.courses.find(
      (x) => x.partnerId === partnerId && x.name.toLowerCase() === c.name.toLowerCase()
    );
    if (!exists) {
      state.data.courses.push({
        id: "course-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
        partnerId,
        name: c.name,
        type: getCourseTypeFromModality(c.modality),
        modality: c.modality,
        area: "",
        cost: 0,
        sale: 0,
        transfer: "",
        deadline: "",
        responsible: "",
        diplomas: "",
        examFileName: "",
        examDataUrl: "",
        notes: c.notes,
      });
      added++;
    }
  });

  saveData();
  render();
  alert("Faculdade Catedral cadastrada! " + added + " cursos adicionados.");
})();
