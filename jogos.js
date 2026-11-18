/* ═══════════════════════════════════════════════════════════════════════
   🎮 ENQUANTO ESPERA — jogos da sala de espera (16/11/2026, aprovado pelo
   usuário; sql/031). Objetivos: conhecer a clínica e os procedimentos que
   ela faz, dicas de saúde e bem-estar, e conhecer o próprio indiDoc.

     ❓ Quiz           5 perguntas: a clínica (do perfil público que o
                       Indiclin manda), procedimentos, saúde e o indiDoc
     🧠 Memória        pares "exame ↔ parte do corpo"
     ✅ Verdade ou mito 5 frases de saúde, sempre com a fonte
     🗺️ Missões        5 tarefas reais no indiDoc

   Estrelas e medalhas ficam NESTE celular (localStorage "jogos-v1") — sem
   ranking e sem dado de saúde. Ao indiDoc só vai a contagem (jogos_eventos:
   o jogo, as estrelas e por onde a pessoa chegou).

   Abre: botão 🎮 do Início (origem "app", ou "dia" em dia de consulta),
   ou pelo link curto ?j=<código da clínica>&o=<whatsapp|balcao|tv|totem>,
   SEM precisar de conta — o paciente na sala de espera joga antes de
   instalar. Funciona sem internet (o perfil da clínica fica guardado).

   Conteúdo: jogos_conteudo.js. O núcleo (window.JogosNucleo) é puro, para
   o teste (testes/testar_jogos.js).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  const C = window.JOGOS_CONTEUDO;
  if (!C) return;

  // ── Núcleo puro ───────────────────────────────────────────────────────
  const norm = (t) => " " + String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim() + " ";

  function casarProcedimento(nome) {
    const n = norm(nome);
    return C.PROCEDIMENTOS.find((p) => p.chaves.some((k) => n.includes(" " + k + " "))) || null;
  }

  function areasDoPerfil(perfil) {
    const areas = new Set(["geral"]);
    if (!perfil) return areas;
    const esp = (perfil.especialidades || []).map(norm).join(" ");
    for (const [k, a] of Object.entries(C.AREAS)) if (a.chaves.some((c) => esp.includes(c))) areas.add(k);
    for (const p of perfil.procedimentos || []) { const m = casarProcedimento(p); if (m) areas.add(m.area); }
    return areas;
  }

  function embaralhar(lista, rnd) {
    const a = lista.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // Pergunta com a certa em opcoes[0] → embaralhada, com o índice da certa.
  function montar(p, rnd) {
    const ordem = embaralhar(p.opcoes.map((t, i) => ({ t, i })), rnd);
    return { ...p, opcoes: ordem.map((o) => o.t), certa: ordem.findIndex((o) => o.i === (p.certa || 0)) };
  }

  const ESPECIALIDADES_COMUNS = ["Cardiologia", "Dermatologia", "Ginecologia", "Oftalmologia", "Ortopedia",
    "Otorrinolaringologia", "Pediatria", "Neurologia", "Endocrinologia", "Urologia", "Clínica Médica", "Odontologia"];

  function perguntasDaClinica(perfil, rnd) {
    if (!perfil || !perfil.nome) return [];
    const nome = perfil.nome, out = [];
    const casados = (perfil.procedimentos || []).map((p) => ({ raw: p, m: casarProcedimento(p) }));
    const daClinica = new Set(casados.filter((x) => x.m).map((x) => x.m.nome));
    const fora = C.PROCEDIMENTOS.filter((p) => !daClinica.has(p.nome) && p.area !== "geral");
    // a) qual destes a clínica faz
    const conhecidos = casados.filter((x) => x.m);
    if (conhecidos.length && fora.length >= 3) {
      const certo = embaralhar(conhecidos, rnd)[0].m;
      out.push({ tipo: "clinica", pergunta: `Qual destes exames ou procedimentos é feito aqui na ${nome}?`,
        opcoes: [certo.nome, ...embaralhar(fora, rnd).slice(0, 3).map((p) => p.nome)],
        explica: `${certo.nome}: ${certo.oque}` });
    }
    // b) para que serve um procedimento da clínica
    if (conhecidos.length) {
      const alvo = embaralhar(conhecidos, rnd)[0].m;
      const outros = embaralhar(C.PROCEDIMENTOS.filter((p) => p.nome !== alvo.nome && p.area !== alvo.area), rnd).slice(0, 3);
      out.push({ tipo: "clinica", pergunta: `A ${nome} faz ${alvo.nome}. Para que serve esse exame?`,
        opcoes: [alvo.oque, ...outros.map((p) => p.oque)], explica: alvo.oque });
    }
    // c) especialidade de um médico
    const meds = (perfil.medicos || []).filter((m) => m.nome && m.especialidade);
    if (meds.length) {
      const m = embaralhar(meds, rnd)[0];
      const outras = embaralhar(ESPECIALIDADES_COMUNS.filter((e) => norm(e) !== norm(m.especialidade)), rnd).slice(0, 3);
      out.push({ tipo: "clinica", pergunta: `Em qual especialidade ${m.nome} atende na ${nome}?`,
        opcoes: [m.especialidade, ...outras], explica: `${m.nome} atende em ${m.especialidade}.` });
    }
    // e) quem atende tal especialidade (17/11/2026) — só com outros médicos
    //    de OUTRA especialidade para as opções erradas
    if (meds.length >= 2) {
      const m = embaralhar(meds, rnd)[0];
      const outros = embaralhar(meds.filter((x) => norm(x.especialidade) !== norm(m.especialidade)), rnd)
        .map((x) => x.nome).filter((n, i, a) => n !== m.nome && a.indexOf(n) === i).slice(0, 3);
      if (outros.length >= 1) {
        out.push({ tipo: "clinica", pergunta: `Quem atende ${m.especialidade} na ${nome}?`,
          opcoes: [m.nome, ...outros], explica: `${m.nome} atende em ${m.especialidade}.` });
      }
    }
    // d) especialidades da clínica
    const esps = (perfil.especialidades || []).filter(Boolean);
    if (esps.length) {
      const certa = embaralhar(esps, rnd)[0];
      const outras = embaralhar(ESPECIALIDADES_COMUNS.filter((e) => !esps.some((x) => norm(x) === norm(e))), rnd).slice(0, 3);
      if (outras.length === 3) {
        out.push({ tipo: "clinica", pergunta: `Qual destas especialidades tem atendimento na ${nome}?`,
          opcoes: [certa, ...outras], explica: `A ${nome} atende: ${esps.join(", ")}.` });
      }
    }
    return embaralhar(out, rnd);
  }

  function perguntasDeSaude(areas, rnd) {
    const out = C.QUIZ.filter((q) => areas.has(q.area)).map((q) => ({ ...q, tipo: "saude" }));
    for (const p of C.PROCEDIMENTOS.filter((x) => areas.has(x.area) && x.area !== "geral")) {
      const outros = embaralhar(C.PROCEDIMENTOS.filter((x) => x.area !== p.area), rnd).slice(0, 3);
      out.push({ tipo: "procedimento", pergunta: `Para que serve: ${p.nome}?`, opcoes: [p.oque, ...outros.map((x) => x.oque)],
                 explica: p.oque });
    }
    return embaralhar(out, rnd);
  }

  // 17/11/2026: as perguntas já vistas neste celular vão para o fim da fila
  const chaveDe = (q) => String(q.pergunta || q.frase || "").slice(0, 90);
  function novasPrimeiro(lista, vistas) {
    if (!vistas || !vistas.size) return lista;
    return lista.map((q, i) => ({ q, i, v: vistas.has(chaveDe(q)) ? 1 : 0 }))
      .sort((a, b) => a.v - b.v || a.i - b.i).map((x) => x.q);
  }

  function rodadaQuiz(perfil, rnd, vistas) {
    const areas = areasDoPerfil(perfil);
    const cli = novasPrimeiro(perguntasDaClinica(perfil, rnd), vistas).slice(0, 2);
    const sau = novasPrimeiro(perguntasDeSaude(areas, rnd), vistas);
    const ind = novasPrimeiro(embaralhar(C.INDIDOC, rnd), vistas).slice(0, 1).map((q) => ({ ...q, tipo: "indidoc" }));
    const lista = [...cli, ...sau.slice(0, 5 - cli.length - ind.length), ...ind];
    return lista.map((q) => montar(q, rnd));
  }

  function rodadaMitos(perfil, rnd, vistas) {
    const areas = areasDoPerfil(perfil);
    const daArea = novasPrimeiro(embaralhar(C.MITOS.filter((m) => areas.has(m.area) && m.area !== "geral"), rnd), vistas).slice(0, 2);
    const gerais = novasPrimeiro(embaralhar(C.MITOS.filter((m) => m.area === "geral"), rnd), vistas);
    return [...daArea, ...gerais].slice(0, 5);
  }

  const ROTULO_AREA = { cardio: "❤️ Coração", oftalmo: "👁️ Olhos", otorrino: "👂 Ouvido e garganta",
    gineco: "🌸 Saúde da mulher", pediatria: "🧒 Bebês e crianças", odonto: "🦷 Dentes",
    pneumo: "🌬️ Pulmões", nefro: "💧 Rins e bexiga", orto: "🦴 Ossos", neuro: "🧠 Cérebro" };
  // Memória por nível (17/11/2026): 4, 6 e 8 pares
  const PARES_NIVEL = [4, 6, 8];

  function paresMemoria(perfil, rnd, n) {
    const areas = areasDoPerfil(perfil);
    const ordemAreas = embaralhar(Object.keys(ROTULO_AREA), rnd).sort((a, b) => (areas.has(b) ? 1 : 0) - (areas.has(a) ? 1 : 0));
    const pares = [];
    for (const a of ordemAreas.slice(0, n || 4)) {
      const p = embaralhar(C.PROCEDIMENTOS.filter((x) => x.area === a), rnd)[0];
      if (p) pares.push({ id: a, exame: p.nome, parte: ROTULO_AREA[a], oque: p.oque });
    }
    return pares;
  }

  const MEDALHAS = {
    clinica: { icone: "🏥", nome: "Conhece a clínica", como: "Acerte 4 de 5 no quiz" },
    mitos:   { icone: "🕵️", nome: "Caçador de mitos", como: "Acerte as 5 de verdade ou mito" },
    memoria: { icone: "🧠", nome: "Memória boa", como: "Complete o jogo da memória" },
    indidoc: { icone: "🗺️", nome: "Explorador do indiDoc", como: "Complete todas as missões" },
  };

  // Clínicas do paciente para o quiz (17/11/2026, "se o usuário tiver o
  // indiDoc de mais de uma clínica"): a da consulta de hoje, depois a da
  // próxima consulta, depois a da mais recente, depois a dos documentos (do
  // mais novo). Antes valia o primeiro compromisso da lista, que podia ser
  // uma consulta antiga de outra clínica.
  function clinicasDoPaciente(comps, docs, hoje) {
    const vistas = new Map();
    const pôr = (x) => {
      const id = x.origem_clinica_id, nome = x.origem_clinica_nome || "";
      if (!id) return;
      if (!vistas.has(id)) vistas.set(id, { id, nome });
      else if (nome && !vistas.get(id).nome) vistas.get(id).nome = nome;
    };
    const dia = (c) => String(c.quando || "").slice(0, 10);
    const cs = (comps || []).filter((c) => c.origem_clinica_id && !c.apagado && !c.cancelado);
    const asc = (a, b) => (dia(a) < dia(b) ? -1 : dia(a) > dia(b) ? 1 : 0);
    cs.filter((c) => dia(c) === hoje).forEach(pôr);
    cs.filter((c) => dia(c) > hoje).sort(asc).forEach(pôr);
    cs.filter((c) => dia(c) < hoje).sort((a, b) => asc(b, a)).forEach(pôr);
    const quandoDoc = (d) => String(d.data_documento || d.criado_em || "");
    (docs || []).filter((d) => d.origem_clinica_id && !d.apagado)
      .sort((a, b) => (quandoDoc(a) < quandoDoc(b) ? 1 : quandoDoc(a) > quandoDoc(b) ? -1 : 0)).forEach(pôr);
    return [...vistas.values()];
  }

  // 🎯 Desafio do dia (17/11/2026): o mesmo para todos no dia, +3 estrelas
  const DESAFIOS = [
    { jogo: "relampago", meta: 100, texto: "Faça 100 pontos no ⚡ Relâmpago" },
    { jogo: "saudavel", meta: 200, texto: "Faça 200 pontos no 🍎 Pegue o saudável" },
    { jogo: "labirinto", meta: 800, texto: "Faça 800 pontos no 💧 Labirinto" },
    { jogo: "quiz", meta: 4, texto: "Acerte 4 no ❓ Quiz" },
    { jogo: "mitos", meta: 4, texto: "Acerte 4 no ✅ Verdade ou mito" },
    { jogo: "memoria", meta: 1, texto: "Complete o 🧠 Jogo da memória" },
    { jogo: "corpo", meta: 1, texto: "Monte o 🧍 corpo inteiro" },
  ];
  function desafioDoDia(iso) {
    const [a, m, d] = String(iso || "").split("-").map(Number);
    const n = Math.floor(Date.UTC(a || 2026, (m || 1) - 1, d || 1) / 86400000);
    return DESAFIOS[((n % DESAFIOS.length) + DESAFIOS.length) % DESAFIOS.length];
  }

  window.JogosNucleo = { norm, casarProcedimento, areasDoPerfil, perguntasDaClinica, perguntasDeSaude,
                         rodadaQuiz, rodadaMitos, paresMemoria, PARES_NIVEL, MEDALHAS, embaralhar, montar,
                         clinicasDoPaciente, chaveDe, desafioDoDia, DESAFIOS };

  // ── Daqui para baixo: a tela (só no navegador) ────────────────────────
  if (typeof document === "undefined" || !document.getElementById("tela-jogos")) return;
  const q = (id) => document.getElementById(id);
  const tela = q("tela-jogos"), palco = q("jg-palco");
  const esc = (t) => (typeof escaparHTML === "function" ? escaparHTML(t) : String(t || ""));
  const CHAVE = "jogos-v1", CHAVE_PERFIL = "jogos-perfil", CHAVE_PERFIS = "jogos-perfis";
  let clinicaEscolhida = "";
  // As listas do app.js. Em try: com o app.js parado no meio (variável
  // declarada e não iniciada), até o `typeof` estoura, e os jogos não podem
  // depender do resto do app para abrir.
  const lista = (nome) => { try { const v = { compromissos, documentos }[nome]; return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  let origem = "app", perfil = null, codigo = "";
  // Jogos de jogos_arcade.js (17/11/2026): registram-se aqui. O que roda
  // com relógio (requestAnimationFrame, setInterval) entrega a função de
  // parar em aoParar — chamada ao sair do jogo (menu, voltar, jogar de novo).
  const EXTRAS = {};
  let parar = null;
  function pararJogo() { const f = parar; parar = null; if (f) { try { f(); } catch (e) {} } }

  const cliente = () => { try { return typeof sb !== "undefined" ? sb : null; } catch (e) { return null; } };

  function ler() { try { return JSON.parse(localStorage.getItem(CHAVE) || "{}"); } catch (e) { return {}; } }
  function gravar(d) { try { localStorage.setItem(CHAVE, JSON.stringify(d)); } catch (e) {} }
  function marcar(chave) { const d = ler(); d.feito = d.feito || {}; d.feito[chave] = 1; gravar(d); }

  function contar(jogo, estrelas) {
    try {
      if (!cliente() || !navigator.onLine) return;
      cliente().from("jogos_eventos").insert({ jogo, origem, clinica_id: (perfil && perfil.clinica_id) || null,
                                        estrelas: estrelas == null ? null : estrelas }).then(() => {}, () => {});
    } catch (e) { /* contar nunca atrapalha o jogo */ }
  }

  function ganharEstrelas(n) { const d = ler(); d.estrelas = (d.estrelas || 0) + n; gravar(d); pintarTopo(); }

  // ── Recordes, perguntas vistas e desafio do dia (17/11/2026) ──────────
  function hoje() { try { return hojeISO(); } catch (e) { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); } }
  // Guarda o recorde; `menor`: quanto menos, melhor (jogadas). True se bateu.
  function recorde(chave, valor, menor) {
    if (valor == null) return false;
    const d = ler(); d.recordes = d.recordes || {};
    const antes = d.recordes[chave];
    if (antes != null && (menor ? valor >= antes : valor <= antes)) return false;
    d.recordes[chave] = valor; gravar(d);
    return antes != null;
  }
  const recordeDe = (chave) => (ler().recordes || {})[chave];
  function marcarVistas(lista) {
    const d = ler(); const v = new Set(d.vistas || []);
    for (const x of lista) v.add(window.JogosNucleo.chaveDe(x));
    d.vistas = [...v].slice(-300); gravar(d);
  }
  const vistas = () => new Set(ler().vistas || []);
  function conferirDesafio(jogo, valor) {
    const dia = hoje(), des = window.JogosNucleo.desafioDoDia(dia), d = ler();
    if (des.jogo !== jogo || valor == null || valor < des.meta || d.desafio === dia) return false;
    d.desafio = dia; gravar(d); ganharEstrelas(3); contar("desafio", 3);
    return true;
  }

  function ganharMedalha(id) {
    const d = ler(); d.medalhas = d.medalhas || {};
    if (d.medalhas[id]) return false;
    d.medalhas[id] = new Date().toISOString().slice(0, 10); gravar(d);
    contar("medalha", null);
    return true;
  }

  function pintarTopo() {
    const d = ler();
    q("jg-estrelas").textContent = "⭐ " + (d.estrelas || 0);
    q("jg-sub").textContent = perfil && perfil.nome ? perfil.nome : "Jogos e dicas de saúde";
  }

  // ── Perfil da clínica: ?j=código, ou a clínica dos compromissos/documentos
  // Um perfil guardado por clínica (sem internet, cada clínica tem o seu);
  // CHAVE_PERFIL segue com o último usado (quem abriu só pelo QR).
  function perfisGuardados() {
    let m = {}, ultimo = null;
    try { m = JSON.parse(localStorage.getItem(CHAVE_PERFIS) || "{}") || {}; } catch (e) {}
    try { ultimo = JSON.parse(localStorage.getItem(CHAVE_PERFIL) || "null"); } catch (e) {}
    if (ultimo && ultimo.clinica_id && !m[ultimo.clinica_id]) m[ultimo.clinica_id] = ultimo;
    return { m, ultimo };
  }
  function guardarPerfil(p) {
    const { m } = perfisGuardados();
    m[p.clinica_id] = p;
    try { localStorage.setItem(CHAVE_PERFIS, JSON.stringify(m)); localStorage.setItem(CHAVE_PERFIL, JSON.stringify(p)); } catch (e) {}
  }
  function clinicas() {
    let hoje = "";
    try { hoje = hojeISO(); } catch (e) {}
    return window.JogosNucleo.clinicasDoPaciente(lista("compromissos"), lista("documentos"), hoje);
  }
  // A clínica do quiz sem QR: a escolhida na troca ou a 1ª da ordem acima
  function idAtual() {
    const cs = clinicas();
    return ((clinicaEscolhida && cs.find((c) => c.id === clinicaEscolhida)) || cs[0] || {}).id || "";
  }

  async function carregarPerfil() {
    const { m, ultimo } = perfisGuardados();
    const idClinica = codigo ? "" : idAtual();
    if (codigo) perfil = Object.values(m).find((p) => p && p.codigo === codigo) || null;
    else perfil = idClinica ? (m[idClinica] || null) : ultimo;
    if ((!codigo && !idClinica) || !cliente() || !navigator.onLine) return;
    try {
      let consulta = cliente().from("clinicas_perfil").select("clinica_id, codigo, nome, cidade, especialidades, medicos, procedimentos");
      consulta = codigo ? consulta.eq("codigo", codigo) : consulta.eq("clinica_id", idClinica);
      const { data } = await consulta.limit(1);
      if (data && data[0]) {
        perfil = data[0];
        guardarPerfil(perfil);
      }
    } catch (e) { /* sem o sql/031 ou sem rede: joga sem as perguntas da clínica */ }
  }

  // ── Menu ──────────────────────────────────────────────────────────────
  function menu() {
    pararJogo();
    const d = ler(), med = d.medalhas || {};
    const feitas = missoes().filter((m) => m.feito).length;
    // Paciente de mais de uma clínica, sem QR: troca rápida da clínica do quiz
    const cs = codigo ? [] : clinicas(), atual = cs.length > 1 ? idAtual() : "";
    const troca = cs.length > 1 ? `<label class="jg-troca">Jogando sobre: <select id="jg-clinica">${cs.map((c) =>
      `<option value="${esc(c.id)}"${c.id === atual ? " selected" : ""}>${esc(c.nome || "Clínica")}</option>`).join("")}</select></label>` : "";
    const des = window.JogosNucleo.desafioDoDia(hoje()), feitoDes = d.desafio === hoje();
    const memNivel = Math.min(3, Math.max(1, d.memNivel || 1));
    const rec = (k, un) => (recordeDe(k) != null ? ` · recorde ${recordeDe(k)}${un}` : "");
    palco.innerHTML = `${troca}
      <div class="jg-topo-menu"><button type="button" id="jg-grande" class="jg-grande-bt${d.grande ? " ligado" : ""}">🔠 Letra grande</button></div>
      <div class="jg-desafio${feitoDes ? " feito" : ""}"><b>🎯 Desafio do dia</b> ${esc(des.texto)}
        <small>${feitoDes ? "Cumprido! +3 ⭐ — volte amanhã para outro." : "Vale +3 ⭐"}</small></div>
      <div class="jg-ola">${perfil && perfil.nome ? `Conheça a <b>${esc(perfil.nome)}</b> e` : "Teste"} o que você sabe de saúde. 😊</div>
      <div class="jg-grade">
        <button type="button" data-jg="quiz"><span>❓</span><b>Quiz</b><small>${perfil ? "A clínica, os exames e a saúde" : "Exames e saúde"}</small></button>
        <button type="button" data-jg="memoria"><span>🧠</span><b>Jogo da memória</b><small>Nível ${memNivel} · ${window.JogosNucleo.PARES_NIVEL[memNivel - 1]} pares</small></button>
        <button type="button" data-jg="mitos"><span>✅</span><b>Verdade ou mito</b><small>Dicas de saúde com fonte</small></button>
        <button type="button" data-jg="missoes"><span>🗺️</span><b>Missões do indiDoc</b><small>${feitas} de ${missoes().length} feitas</small></button>
      </div>
      ${Object.keys(EXTRAS).length ? `<div class="jg-t">⚡ Mais agitados</div><div class="jg-grade">${Object.entries(EXTRAS).map(([k, x]) =>
        `<button type="button" data-jg="${k}"><span>${x.icone}</span><b>${esc(x.nome)}</b><small>${esc(typeof x.sub === "function" ? x.sub() : x.sub)}</small></button>`).join("")}</div>` : ""}
      <div class="jg-t">🏅 Suas medalhas</div>
      <div class="jg-medalhas">${Object.entries(MEDALHAS).map(([k, m]) =>
        `<div class="jg-med${med[k] ? " ganha" : ""}"><span>${m.icone}</span><b>${esc(m.nome)}</b><small>${med[k] ? "Conquistada!" : esc(m.como)}</small></div>`).join("")}</div>
      <p class="jg-aviso">Conteúdo educativo, com fontes oficiais. Não substitui a orientação do seu médico.</p>`;
    q("jg-grande").onclick = () => { const g = ler(); g.grande = !g.grande; gravar(g); aplicarLetra(); menu(); };
    const sel = q("jg-clinica");
    if (sel) sel.onchange = async () => {
      clinicaEscolhida = sel.value;
      await carregarPerfil();
      pintarTopo(); menu();
    };
  }

  // ── Quiz ──────────────────────────────────────────────────────────────
  function quiz() {
    const perguntas = rodadaQuiz(perfil, Math.random, vistas());
    marcarVistas(perguntas);
    let i = 0, acertos = 0;
    const mostrar = () => {
      const p = perguntas[i];
      palco.innerHTML = `<div class="jg-passo">Pergunta ${i + 1} de ${perguntas.length}${p.tipo === "clinica" ? " · 🏥 a clínica"
          : p.tipo === "indidoc" ? " · 📱 o indiDoc" : ""}</div>
        <div class="jg-perg">${esc(p.pergunta)}</div>
        <div class="jg-ops">${p.opcoes.map((o, k) => `<button type="button" data-op="${k}">${esc(o)}</button>`).join("")}</div>
        <div id="jg-resp"></div>`;
      for (const b of palco.querySelectorAll("[data-op]")) b.onclick = () => responder(+b.dataset.op);
    };
    const responder = (k) => {
      const p = perguntas[i], certo = k === p.certa;
      if (certo) acertos++;
      palco.querySelectorAll("[data-op]").forEach((b, n) => {
        b.disabled = true;
        if (n === p.certa) b.classList.add("certa"); else if (n === k) b.classList.add("errada");
      });
      q("jg-resp").innerHTML = `<div class="jg-expl ${certo ? "ok" : ""}"><b>${certo ? "Isso! 🎉" : "Quase!"}</b> ${esc(p.explica || "")}
        ${p.fonte ? `<small>Fonte: ${esc(p.fonte)}</small>` : ""}</div>
        <button type="button" class="jg-seguir">${i + 1 < perguntas.length ? "Próxima →" : "Ver resultado"}</button>`;
      palco.querySelector(".jg-seguir").onclick = () => { i++; if (i < perguntas.length) mostrar(); else fim(); };
    };
    const fim = () => {
      const est = Math.round(5 * acertos / perguntas.length);
      ganharEstrelas(est); marcar("quiz"); contar("quiz", est);
      const nova = acertos >= 4 && ganharMedalha("clinica");
      resultado(`${acertos} de ${perguntas.length} certas`, est, nova ? "clinica" : "", "quiz", acertos);
    };
    mostrar();
  }

  // ── Verdade ou mito ───────────────────────────────────────────────────
  function mitos() {
    const frases = rodadaMitos(perfil, Math.random, vistas());
    marcarVistas(frases);
    let i = 0, acertos = 0, respondida = false;
    const mostrar = () => {
      const f = frases[i];
      respondida = false;
      palco.innerHTML = `<div class="jg-passo">Frase ${i + 1} de ${frases.length} · arraste a carta: → verdade, ← mito</div>
        <div class="jg-carta" id="jg-carta"><span class="jg-carta-sel v">VERDADE</span><span class="jg-carta-sel m">MITO</span>
          <div class="jg-perg">“${esc(f.frase)}”</div></div>
        <div class="jg-vm"><button type="button" data-vm="0">❌ Mito</button><button type="button" data-vm="1">✅ Verdade</button></div>
        <div id="jg-resp"></div>`;
      for (const b of palco.querySelectorAll("[data-vm]")) b.onclick = () => responder(b.dataset.vm === "1");
      arrastarCarta(q("jg-carta"), (verdade) => responder(verdade));
    };
    const responder = (disse) => {
      if (respondida) return;
      respondida = true;
      const f = frases[i], certo = disse === f.verdade;
      const carta = q("jg-carta");
      if (carta) { carta.classList.add(disse ? "foi-v" : "foi-m"); }
      if (certo) acertos++;
      palco.querySelectorAll("[data-vm]").forEach((b) => {
        b.disabled = true;
        if ((b.dataset.vm === "1") === f.verdade) b.classList.add("certa"); else b.classList.add("errada");
      });
      q("jg-resp").innerHTML = `<div class="jg-expl ${certo ? "ok" : ""}"><b>${f.verdade ? "Verdade." : "Mito."}</b> ${esc(f.explica)}
        <small>Fonte: ${esc(f.fonte)}</small></div>
        <div class="jg-fim-bts"><button type="button" class="jg-seguir" id="jg-mito-seg">${i + 1 < frases.length ? "Próxima →" : "Ver resultado"}</button>
        <a class="jg-menu jg-zap" target="_blank" rel="noopener" href="${esc(linkZap(`${f.verdade ? "✅ Verdade" : "❌ Mito"}: “${f.frase}” — ${f.explica} (Fonte: ${f.fonte})`))}">📲 Enviar a dica</a></div>`;
      q("jg-mito-seg").onclick = () => { i++; if (i < frases.length) mostrar(); else fim(); };
    };
    const fim = () => {
      ganharEstrelas(acertos); marcar("mitos"); contar("mito", acertos);
      const nova = acertos === frases.length && ganharMedalha("mitos");
      resultado(`${acertos} de ${frases.length} certas`, acertos, nova ? "mitos" : "", "mitos", acertos);
    };
    mostrar();
  }

  // ── Memória ───────────────────────────────────────────────────────────
  function memoria() {
    const nivel = Math.min(3, Math.max(1, ler().memNivel || 1)), npares = window.JogosNucleo.PARES_NIVEL[nivel - 1];
    const pares = paresMemoria(perfil, Math.random, npares);
    const cartas = window.JogosNucleo.embaralhar(pares.flatMap((p) => [
      { par: p.id, texto: p.exame, tipo: "exame" }, { par: p.id, texto: p.parte, tipo: "parte" }]), Math.random);
    let abertas = [], achados = 0, jogadas = 0, travado = false;
    const rec = recordeDe("memoria" + nivel);
    palco.innerHTML = `<div class="jg-passo"><b>Nível ${nivel}</b> · ${pares.length} pares${rec ? ` · recorde ${rec} jogadas` : ""}. Ache cada exame com a parte do corpo que ele avalia.</div>
      <div class="jg-mem n${pares.length}">${cartas.map((c, k) => `<button type="button" data-c="${k}" class="${c.tipo}"><span>${esc(c.texto)}</span></button>`).join("")}</div>
      <div id="jg-resp"></div>`;
    for (const b of palco.querySelectorAll("[data-c]")) b.onclick = () => virar(b);
    function virar(b) {
      if (travado || b.classList.contains("aberta")) return;
      b.classList.add("aberta"); abertas.push(b);
      if (abertas.length < 2) return;
      jogadas++;
      const [a, c] = abertas.map((x) => cartas[+x.dataset.c]);
      if (a.par === c.par && a.tipo !== c.tipo) {
        abertas.forEach((x) => x.classList.add("achada")); abertas = []; achados++;
        const p = pares.find((x) => x.id === a.par);
        q("jg-resp").innerHTML = `<div class="jg-expl ok"><b>${esc(p.exame)}:</b> ${esc(p.oque)}</div>`;
        if (achados === pares.length) setTimeout(fim, 900);
      } else {
        travado = true;
        setTimeout(() => { abertas.forEach((x) => x.classList.remove("aberta")); abertas = []; travado = false; }, 900);
      }
    }
    function fim() {
      const est = jogadas <= pares.length + 2 ? 5 : jogadas <= pares.length + 5 ? 4 : 3;
      ganharEstrelas(est); marcar("memoria"); contar("memoria", est);
      const bateu = recorde("memoria" + nivel, jogadas, true);
      const sobe = est >= 4 && nivel < 3;
      if (sobe) { const d = ler(); d.memNivel = nivel + 1; gravar(d); }
      const nova = ganharMedalha("memoria");
      resultado(`Nível ${nivel}: ${jogadas} jogadas${bateu ? " · novo recorde! 🏆" : ""}${sobe ? ` · próximo: nível ${nivel + 1}` : ""}`,
                est, nova ? "memoria" : "", "memoria", 1);
    }
  }

  // ── Missões do indiDoc ────────────────────────────────────────────────
  function missoes() {
    const f = (ler().feito) || {};
    const temDoc = lista("documentos").some((d) => !d.apagado);
    let comEmail = false;
    try { comEmail = typeof contaAnonima === "function" && !!usuario && !contaAnonima(); } catch (e) {}
    return [
      { id: "doc", titulo: "Guarde o seu primeiro exame", feito: temDoc, ir: "fotografar" },
      { id: "agenda", titulo: "Abra a sua Agenda", feito: !!f.agenda, ir: "agenda" },
      { id: "mostrar", titulo: "Veja como mostrar os exames ao médico", feito: !!f.mostrar, ir: "mostrar" },
      { id: "quiz", titulo: "Jogue uma rodada do quiz", feito: !!f.quiz, ir: "quiz" },
      { id: "email", titulo: "Guarde o seu acesso com o e-mail", feito: comEmail, ir: "conta" },
      // 17/11/2026: mais três, úteis de verdade
      { id: "avisos", titulo: "Ative os avisos no celular", feito: avisosLigados(), ir: "avisos" },
      { id: "familia", titulo: "Cadastre alguém da família", feito: temFamilia(), ir: "conta" },
      { id: "conversas", titulo: "Abra as Conversas com a clínica", feito: !!f.conversas, ir: "conversas" },
    ];
  }

  function avisosLigados() { try { return typeof Notification !== "undefined" && Notification.permission === "granted"; } catch (e) { return false; } }
  function temFamilia() { try { return pessoasProprias().length > 1; } catch (e) { return false; } }

  function telaMissoes() {
    const lista = missoes(), feitas = lista.filter((m) => m.feito).length;
    if (feitas === lista.length && ganharMedalha("indidoc")) {
      ganharEstrelas(5); contar("missoes", 5);
      return resultado("Todas as missões feitas", 5, "indidoc", "missoes");
    }
    palco.innerHTML = `<div class="jg-passo">${feitas} de ${lista.length} missões feitas</div>
      <div class="jg-barra"><i style="width:${Math.round(100 * feitas / lista.length)}%"></i></div>
      ${lista.map((m) => `<div class="jg-missao${m.feito ? " feita" : ""}"><span>${m.feito ? "✅" : "○"}</span><b>${esc(m.titulo)}</b>
        ${m.feito ? "" : `<button type="button" data-ir="${m.ir}">Fazer</button>`}</div>`).join("")}
      <p class="jg-aviso">Complete todas e ganhe a medalha 🗺️ Explorador do indiDoc.</p>`;
    for (const b of palco.querySelectorAll("[data-ir]")) b.onclick = () => irMissao(b.dataset.ir);
  }

  function irMissao(ir) {
    if (ir === "quiz") return quiz();
    fechar();
    try {
      if (ir === "fotografar") (q("ini-fotografar") || q("btn-fotografar")).click();
      else if (ir === "conta") { if (q("btn-conta")) q("btn-conta").click(); }
      else if (ir === "avisos") { if (typeof ativarAvisos === "function") ativarAvisos(); }
      else if (window.Abas) Abas.ir(ir);
    } catch (e) {}
  }
  // Agenda e "Mostrar ao médico" abertos de qualquer jeito contam a missão.
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ir='agenda'], [data-ir='mostrar'], [data-ir='conversas'], #btn-mostrar");
    if (b && !tela.contains(b)) marcar(b.dataset.ir === "agenda" ? "agenda" : b.dataset.ir === "conversas" ? "conversas" : "mostrar");
  }, true);

  // ── Resultado ─────────────────────────────────────────────────────────
  // Link do WhatsApp com o texto e o convite (origem "whatsapp" — volta contada)
  function linkZap(texto) {
    const base = location.origin + location.pathname;
    const link = perfil && perfil.codigo ? `${base}?j=${perfil.codigo}&o=whatsapp` : base;
    return "https://wa.me/?text=" + encodeURIComponent(`${texto}\n\n🎮 Jogue também no indiDoc: ${link}`);
  }
  const NOMES = { quiz: "Quiz", mitos: "Verdade ou mito", memoria: "Jogo da memória", missoes: "Missões" };

  // `valor`: o número do jogo (pontos, acertos) para o desafio do dia
  function resultado(titulo, estrelas, medalha, deNovo, valor) {
    const m = medalha ? MEDALHAS[medalha] : null;
    const des = conferirDesafio(deNovo, valor);
    const nome = NOMES[deNovo] || (EXTRAS[deNovo] || {}).nome || "jogo";
    const onde = perfil && perfil.nome ? ` na sala de espera da ${perfil.nome}` : "";
    palco.innerHTML = `<div class="jg-fim"><div class="jg-est">${"⭐".repeat(estrelas)}${"☆".repeat(5 - estrelas)}</div>
      <b>${esc(titulo)}</b>
      ${m ? `<div class="jg-nova">${m.icone} Medalha nova: <b>${esc(m.nome)}</b>!</div>` : ""}
      ${des ? `<div class="jg-nova">🎯 Desafio do dia cumprido! <b>+3 ⭐</b></div>` : ""}
      <div class="jg-fim-bts"><button type="button" class="jg-seguir" data-jg="${deNovo}">Jogar de novo</button>
      <button type="button" class="jg-menu" data-jg="menu">Outros jogos</button>
      <a class="jg-menu jg-zap" target="_blank" rel="noopener" href="${esc(linkZap(`Fiz ${titulo} no ${nome} do indiDoc${onde} 😄`))}">📲 Compartilhar</a></div></div>`;
  }

  // Letra grande (pacientes idosos): classe na tela, guardada neste celular
  function aplicarLetra() { tela.classList.toggle("jg-grande", !!ler().grande); }
  aplicarLetra();

  // Verdade ou mito: arrastar a carta (→ verdade, ← mito)
  function arrastarCarta(el, aoSoltar) {
    if (!el) return;
    let x0 = null, dx = 0;
    el.addEventListener("pointerdown", (e) => { x0 = e.clientX; dx = 0; el.style.transition = "none"; try { el.setPointerCapture(e.pointerId); } catch (er) {} });
    el.addEventListener("pointermove", (e) => {
      if (x0 == null) return;
      dx = e.clientX - x0;
      el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      el.classList.toggle("quase-v", dx > 40); el.classList.toggle("quase-m", dx < -40);
    });
    const soltar = () => {
      if (x0 == null) return;
      x0 = null; el.style.transition = "";
      el.classList.remove("quase-v", "quase-m");
      if (Math.abs(dx) > 80) aoSoltar(dx > 0);
      else el.style.transform = "";
    };
    el.addEventListener("pointerup", soltar);
    el.addEventListener("pointercancel", soltar);
  }

  palco.addEventListener("click", (e) => {
    const b = e.target.closest("[data-jg]");
    if (!b) return;
    const acao = { quiz, memoria, mitos, missoes: telaMissoes, menu }[b.dataset.jg] || (EXTRAS[b.dataset.jg] || {}).abrir;
    if (acao) { pararJogo(); acao(); }
  });

  // ── Abrir e fechar ────────────────────────────────────────────────────
  async function abrir(deOnde) {
    origem = deOnde || "app";
    tela.classList.remove("escondido");
    document.body.classList.add("sem-rolar");
    pintarTopo(); menu();
    contar("abriu", null);
    await carregarPerfil();
    pintarTopo(); menu();
  }
  function fechar() { pararJogo(); tela.classList.add("escondido"); document.body.classList.remove("sem-rolar"); }
  q("jg-fechar").onclick = () => (palco.querySelector(".jg-grade") ? fechar() : menu());

  // Voltar do Android (18/11/2026, "clica uma vez na seta e não acontece
  // nada, no segundo sai do indiDoc"): a tela dos jogos não estava na lista
  // do app.js — o 1º toque só mostrava o aviso de sair (escondido por baixo
  // dos jogos) e o 2º saía. Agora faz o mesmo que o "← Voltar": dentro de um
  // jogo volta ao menu; no menu fecha os jogos. Vem PRIMEIRO na lista: os
  // jogos abrem por cima de tudo.
  if (typeof FECHAR_TELA_CHEIA === "object") {
    const resto = { ...FECHAR_TELA_CHEIA };
    for (const k of Object.keys(FECHAR_TELA_CHEIA)) delete FECHAR_TELA_CHEIA[k];
    Object.assign(FECHAR_TELA_CHEIA, { "tela-jogos": "jg-fechar" }, resto);
  }

  // Botão do Início: "dia" quando há consulta hoje (o destaque)
  function consultaHoje() {
    let hoje = "";
    try { hoje = hojeISO(); } catch (e) {}
    return lista("compromissos")
      .some((c) => c.quando === hoje && c.origem === "clinica" && !c.apagado && !c.cancelado);
  }
  function pintarBotao() {
    const b = q("ini-jogos");
    if (!b) return;
    const dia = consultaHoje();
    b.classList.toggle("destaque", dia);
    q("ini-jogos-sub").textContent = dia ? "Consulta hoje? Conheça a clínica enquanto espera"
                                         : "Quiz, memória e verdade ou mito";
  }
  if (q("ini-jogos")) {
    q("ini-jogos").onclick = () => abrir(consultaHoje() ? "dia" : "app");
    pintarBotao(); setInterval(pintarBotao, 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) pintarBotao(); });
  }

  // Link curto: ?j=<código>&o=<origem>, ou #jogos
  const ps = new URLSearchParams(location.search);
  const j = (ps.get("j") || "").toLowerCase();
  if (/^[a-z0-9]{8}$/.test(j) || location.hash === "#jogos") {
    codigo = /^[a-z0-9]{8}$/.test(j) ? j : "";
    const o = ps.get("o");
    history.replaceState(history.state, "", location.pathname);
    setTimeout(() => abrir(["whatsapp", "balcao", "tv", "totem"].includes(o) ? o : "app"), 300);
  }

  // Para jogos_arcade.js: registrar(id, {icone, nome, sub, abrir}) e o kit
  // comum (palco, estrelas, medalhas, contagem, resultado, perfil).
  function registrar(id, jogo) { EXTRAS[id] = jogo; if (!tela.classList.contains("escondido") && palco.querySelector(".jg-grade")) menu(); }
  const kit = { palco, q, esc, ler, gravar, marcar, contar, ganharEstrelas, ganharMedalha, resultado, cliente,
                recorde, recordeDe, linkZap,
                perfil: () => perfil, aoParar: (f) => { pararJogo(); parar = f; } };
  window.Jogos = { abrir, fechar, registrar, kit };
})();
