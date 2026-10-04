/* ═══════════════════════════════════════════════════════════════════════
   FALAR COM A CLÍNICA (sql/018) — conversa com a recepção, no jeito do
   WhatsApp: lista de conversas, balões, ✓✓, e o campo embaixo.

   Uma conversa por (pessoa, clínica) — a mesma relação de `recebimentos`:
   só conversa com a clínica quem aceitou receber dela. A mãe que guarda os
   exames do filho tem duas conversas com a mesma clínica, uma por pessoa,
   porque a recepção precisa saber DE QUEM é o assunto.

   O app escreve só pela função `enviar_mensagem`, que confere a pessoa, o
   recebimento e o limite do dia; a tabela não aceita insert do app.

   Carregado DEPOIS de app.js: usa `sb`, `pessoas`, `aviso`, `escaparHTML`,
   `nomeDaPessoa`, `pessoaDe` e `FECHAR_TELA_CHEIA` de lá.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  // Os mais usados numa conversa com a recepção. O teclado do celular tem os demais.
  const EMOJIS = ("😊 🙂 😀 😂 😅 😉 😍 🥰 😘 🤗 🤔 😐 😔 😢 😷 🤒 🤕 🙏 👍 👏 🙌 💪 👋 ✌️ "
    + "👌 🤝 🙋 ❤️ 💙 💚 💛 🌹 🌻 🎉 ✨ ✅ ❌ ⚠️ ❓ 🩺 💊 💉 🩹 🏥 📅 ⏰ 📄 📞").split(" ");
  const CORES = ["#00a884", "#1a73e8", "#e2711d", "#8e44ad", "#c0392b", "#16a085", "#2c3e50"];

  const tela = document.getElementById("tela-conversa");
  if (!tela) return;
  const q = (id) => document.getElementById(id);
  const c = {
    badge: q("btn-conversa-badge"), voltar: q("conv-voltar"), titulo: q("conv-titulo"),
    sub: q("conv-sub"), avatar: q("conv-avatar"), lista: q("conv-lista"), chat: q("conv-chat"),
    msgs: q("conv-msgs"), emojis: q("conv-emojis"), btnEmoji: q("conv-btn-emoji"),
    campo: q("conv-campo"), enviar: q("conv-enviar"),
    rodape: q("conv-rodape"), fechado: q("conv-fechado"), acesso: q("conv-acesso"),
  };

  let conversas = [];        // [{pessoa_id, clinica_id, clinica_nome}]
  let mensagens = [];        // todas as da conta (as 500 mais recentes)
  let aberta = null;         // {pessoa_id, clinica_id, clinica_nome}
  let timer = null;
  let enviando = false;
  let noInicio = false;      // a lista é a aba Conversas (abas.js)
  let acessos = null;        // médicos desta clínica que veem o acervo (null = não deu para ler)

  const chave = (p, cl) => p + "|" + cl;
  const daConversa = (cv) => mensagens.filter((m) => m.pessoa_id === cv.pessoa_id && m.clinica_id === cv.clinica_id);
  const naoLidas = (cv) => daConversa(cv).filter((m) => m.de === "clinica" && !m.lida_em).length;

  // O que a clínica mandou para esta pessoa: está no acervo (`documentos`,
  // app.js) e aparece também no fio. Nada é lido de novo do servidor.
  const docsDa = (cv) => (typeof documentos === "undefined" ? [] : documentos)
    .filter((d) => d.origem === "clinica" && d.origem_clinica_id === cv.clinica_id && d.pessoa_id === cv.pessoa_id);
  // Consultas que a clínica marcou. Compromisso não tem pessoa (é da conta),
  // então aparece em toda conversa com aquela clínica.
  const consultasDa = (cv) => (typeof compromissos === "undefined" ? [] : compromissos)
    .filter((x) => x.origem_clinica_id === cv.clinica_id && !x.apagado && x.criado_em);

  function iniciais(nome) {
    const p = String(nome || "?").replace(/^(cl[ií]nica|centro|instituto)\s+/i, "").split(/\s+/).filter(Boolean);
    return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
  }
  function cor(id) {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return CORES[h % CORES.length];
  }
  function hora(iso) {
    try { return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return ""; }
  }
  function diaDe(iso) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  }
  function rotuloDia(iso) {
    const d = diaDe(iso), hoje = diaDe(new Date().toISOString());
    const ontem = diaDe(new Date(Date.now() - 86400000).toISOString());
    if (d === hoje) return "Hoje";
    if (d === ontem) return "Ontem";
    return d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4);
  }
  // Na lista: hora se for hoje, "Ontem", ou a data — como o WhatsApp.
  function quandoNaLista(iso) {
    const r = rotuloDia(iso);
    return r === "Hoje" ? hora(iso) : r;
  }
  function nomePessoa(id) {
    try { return nomeDaPessoa(pessoaDe(id)); } catch (e) { return ""; }
  }

  async function carregar() {
    const [rec, msg] = await Promise.all([
      sb.from("recebimentos").select("pessoa_id, clinica_id, clinica_nome, criado_em")
        .is("revogado_em", null).order("criado_em", { ascending: false }),
      sb.from("mensagens")
        .select("id, pessoa_id, clinica_id, clinica_nome, de, assunto, texto, autor, criado_em, entregue_em, lida_em")
        .order("criado_em", { ascending: false }).limit(500),
    ]);
    if (rec.error || msg.error) throw (rec.error || msg.error);
    mensagens = (msg.data || []).reverse();
    const vistas = new Map();
    for (const r of rec.data || []) vistas.set(chave(r.pessoa_id, r.clinica_id), { ...r, ativa: true });
    // Conversa com clínica cujo recebimento foi cancelado: continua legível,
    // mas fechada para escrever.
    for (const m of mensagens) {
      const k = chave(m.pessoa_id, m.clinica_id);
      if (!vistas.has(k)) vistas.set(k, { pessoa_id: m.pessoa_id, clinica_id: m.clinica_id,
                                          clinica_nome: m.clinica_nome, ativa: false });
    }
    conversas = [...vistas.values()];
    const ultima = (cv) => { const l = daConversa(cv); return l.length ? l[l.length - 1].criado_em : (cv.criado_em || ""); };
    conversas.sort((a, b) => String(ultima(b)).localeCompare(String(ultima(a))));
    pintarBadge();
  }

  function pintarBadge() {
    if (!c.badge) return;
    const n = conversas.reduce((s, cv) => s + naoLidas(cv), 0);
    c.badge.textContent = n > 9 ? "9+" : String(n);
    c.badge.classList.toggle("escondido", n === 0);
    const nb = q("nav-conv-badge");
    if (nb) { nb.textContent = c.badge.textContent; nb.classList.toggle("escondido", n === 0); }
  }

  // Consulta hoje ou amanhã: o lembrete que ficava acima do Fotografar.
  function faixaConsulta() {
    const pre = window.PreConsulta && PreConsulta.cartaoInicio();
    if (pre) return pre;
    try {
      const p = proximosCompromissos(compromissos, 3).find((x) => [0, 1].includes(diasAte(x.quando)));
      if (!p) return null;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "conv-faixa";
      b.innerHTML = `📅 <span><b>${(t => t[0].toUpperCase() + t.slice(1))(comoFalta(diasAte(p.quando)).texto)} · ${escaparHTML(p.titulo)}</b><br>`
        + `${escaparHTML([p.previsao || p.hora, p.onde].filter(Boolean).join(" · "))}</span>`;
      b.onclick = () => window.Abas && Abas.ir("agenda");
      return b;
    } catch (e) { return null; }
  }
  /* INDIQUE O INDIDOC (04/10). O acervo saiu do topo (está na aba
     Documentos); no lugar, as clínicas que o paciente frequenta e que ainda
     não usam o Indiclin: os lugares que ELE anotou na Agenda ("Onde") e que
     não aparecem nas conversas. Sem nenhum, uma linha genérica. O toque abre
     o compartilhar do celular com um texto pronto; ✕ esconde. */
  const LINK_INDICAR = "https://indiclin.com.br/apresentacao";
  const semAcentoMin = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
  function ocultos() { try { return JSON.parse(localStorage.getItem("indicar-oculto") || "[]"); } catch (e) { return []; } }
  function ocultar(k) {
    try { localStorage.setItem("indicar-oculto", JSON.stringify([...ocultos(), k])); } catch (e) {}
    desenharLista();
  }
  function lugaresParaIndicar() {
    const conhecidas = [...conversas.map((cv) => cv.clinica_nome),
      ...(typeof compromissos === "undefined" ? [] : compromissos)
        .filter((x) => x.origem === "clinica").map((x) => x.origem_clinica_nome)]
      .map(semAcentoMin).filter(Boolean);
    const vistos = new Map();
    const lista = (typeof compromissos === "undefined" ? [] : compromissos)
      .filter((x) => x.origem !== "clinica" && !x.apagado && (x.onde || "").trim())
      .sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
    for (const x of lista) {
      const nome = x.onde.trim(), k = semAcentoMin(nome);
      if (vistos.has(k) || conhecidas.some((cn) => cn === k || cn.includes(k) || k.includes(cn))) continue;
      vistos.set(k, nome);
    }
    const esc = ocultos();
    return [...vistos].filter(([k]) => !esc.includes(k)).slice(0, 3);
  }
  async function indicar(lugar) {
    const texto = `Olá${lugar ? ", " + lugar : ""}! Sou paciente de vocês e guardo meus exames no indiDoc. `
      + "Se a clínica usar o Indiclin, meus exames e receitas chegam direto no app. Conheçam:";
    try {
      if (navigator.share) return await navigator.share({ title: "indiDoc", text: texto, url: LINK_INDICAR });
    } catch (e) { if (e && e.name === "AbortError") return; }
    window.open("https://wa.me/?text=" + encodeURIComponent(texto + " " + LINK_INDICAR), "_blank", "noopener");
  }
  function blocoIndicar() {
    const lugares = lugaresParaIndicar();
    const itens = lugares.length ? lugares
      : (ocultos().includes("*") ? [] : [["*", ""]]);
    if (!itens.length) return null;
    const div = document.createElement("div");
    div.className = "conv-indicar";
    div.innerHTML = `<div class="ci-tit">📣 Indique o indiDoc às suas clínicas</div>
      <div class="ci-sub">Clínica que usa o Indiclin manda exames e receitas direto para cá.</div>`
      + itens.map(([k, nome]) => `<div class="ci-item">
          <span class="ci-nome">${nome ? escaparHTML(nome) : "Sua clínica ainda não usa o indiDoc?"}</span>
          <button type="button" class="ci-ir" data-k="${escaparHTML(k)}">Indicar</button>
          <button type="button" class="ci-x" data-k="${escaparHTML(k)}" aria-label="Não mostrar mais">✕</button>
        </div>`).join("");
    const nomes = new Map(itens);
    div.querySelectorAll(".ci-ir").forEach((b) => { b.onclick = () => indicar(nomes.get(b.dataset.k)); });
    div.querySelectorAll(".ci-x").forEach((b) => { b.onclick = () => ocultar(b.dataset.k); });
    return div;
  }

  function desenharLista() {
    c.titulo.textContent = noInicio ? "indiDoc" : "Conversas";
    c.sub.textContent = noInicio ? "" : "com a recepção das suas clínicas";
    c.voltar.classList.toggle("escondido", noInicio);
    for (const id of ["conv-ini-conta", "conv-fab"]) q(id).classList.toggle("escondido", !noInicio);
    c.avatar.classList.add("escondido");
    c.chat.classList.add("escondido");
    c.lista.classList.remove("escondido");
    if (noInicio) {
      tela.classList.add("como-aba");
      c.lista.innerHTML = "";
      const f = faixaConsulta();
      if (f) c.lista.appendChild(f);
      const dc = window.DepoisConsulta && DepoisConsulta.cartoesInicio();
      if (dc) c.lista.appendChild(dc);
    }
    if (!conversas.length && noInicio) {
      c.lista.insertAdjacentHTML("beforeend", `
        <div class="conv-vazio curto">
          <b>Nenhuma clínica ainda</b>
          <p>Quando uma clínica que usa o indiDoc enviar seus documentos, ela aparece
          aqui e você fala com a recepção por mensagem.</p>
        </div>`);
      const ind = blocoIndicar();
      if (ind) c.lista.appendChild(ind);
      return;
    }
    if (!conversas.length) {
      c.lista.innerHTML = `
        <div class="conv-vazio">
          <div class="conv-vazio-ico">💬</div>
          <b>Nenhuma conversa ainda</b>
          <p>Quando a sua clínica usar o indiDoc, ela pede no balcão para enviar seus
          documentos. Depois de você aceitar, é por aqui que você fala com a recepção:
          remarcar, tirar uma dúvida, sem ficar esperando no telefone.</p>
        </div>`;
      return;
    }
    const varias = pessoas.length > 1;
    if (!noInicio) c.lista.innerHTML = "";
    for (const cv of conversas) {
      const l = daConversa(cv), n = naoLidas(cv);
      const doc = docsDa(cv).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))[0];
      const ult = doc && (!l.length || doc.criado_em > l[l.length - 1].criado_em)
        ? { de: "clinica", texto: (ICONES[doc.tipo] || "📎") + " " + (doc.nome || "Documento"), criado_em: doc.criado_em }
        : l[l.length - 1];
      const previa = ult ? (ult.de === "paciente" ? "Você: " : "") + ult.texto.replace(/\s+/g, " ") : "Toque para escrever à recepção";
      const linha = document.createElement("button");
      linha.type = "button";
      linha.className = "conv-linha";
      linha.innerHTML = `
        <span class="conv-av" style="background:${cor(cv.clinica_id)}">${escaparHTML(iniciais(cv.clinica_nome))}</span>
        <span class="conv-meio">
          <span class="conv-nome">${escaparHTML(cv.clinica_nome || "Clínica")}${varias ? ` <small>· ${escaparHTML(nomePessoa(cv.pessoa_id))}</small>` : ""}</span>
          <span class="conv-previa${n ? " forte" : ""}">${ult && ult.de === "paciente" ? tique(ult) + " " : ""}${escaparHTML(previa.slice(0, 90))}</span>
        </span>
        <span class="conv-lado">
          <span class="conv-hora${n ? " nova" : ""}">${ult ? quandoNaLista(ult.criado_em) : ""}</span>
          ${n ? `<span class="conv-qtd">${n}</span>` : ""}
        </span>`;
      linha.onclick = () => abrirConversa(cv);
      c.lista.appendChild(linha);
    }
    if (noInicio) { const ind = blocoIndicar(); if (ind) c.lista.appendChild(ind); }
  }

  function tique(m) {
    return m.entregue_em ? '<span class="conv-tq" title="Recebida pela clínica">✓✓</span>'
                         : '<span class="conv-tq" title="Enviada">✓</span>';
  }

  // Endereço https:// em mensagem da clínica vira link (abre fora do app).
  function linkar(html, daClinica) {
    if (!daClinica) return html;
    return html.replace(/https:\/\/[^\s<]+/g,
      u => `<a href="${u}" target="_blank" rel="noopener" style="color:#027eb5;text-decoration:underline">${u}</a>`);
  }

  function desenharConversa(rolar) {
    const cv = aberta;
    const perto = c.msgs.scrollHeight - c.msgs.scrollTop - c.msgs.clientHeight < 80;
    c.titulo.textContent = cv.clinica_nome || "Clínica";
    c.sub.textContent = pessoas.length > 1 ? "sobre " + nomePessoa(cv.pessoa_id) : "Recepção";
    c.avatar.textContent = iniciais(cv.clinica_nome);
    c.avatar.style.background = cor(cv.clinica_id);
    c.avatar.classList.remove("escondido");
    c.lista.classList.add("escondido");
    c.chat.classList.remove("escondido");

    desenharAcesso();
    const l = daConversa(cv);
    const fio = [...l.map((m) => ({ k: "m", m, t: m.criado_em })),
                 ...docsDa(cv).map((d) => ({ k: "d", d, t: d.criado_em })),
                 ...consultasDa(cv).map((x) => ({ k: "c", x, t: x.criado_em }))]
      .sort((a, b) => String(a.t).localeCompare(String(b.t)));
    let html = `<div class="conv-aviso">🔒 Só a recepção da clínica lê esta conversa.
      <b>Não use para urgências</b>: em emergência, ligue 192.</div>`;
    let dia = "";
    for (const it of fio) {
      const d = rotuloDia(it.t);
      if (d !== dia) { html += `<div class="conv-dia"><span>${d}</span></div>`; dia = d; }
      if (it.k === "d") {
        const n = (it.d.documento_paginas || []).length;
        html += `<button type="button" class="conv-bal ela conv-anexo" data-doc="${escaparHTML(it.d.id)}">
          <span class="cx"><span class="i">${ICONES[it.d.tipo] || "📎"}</span>
            <span><b>${escaparHTML(it.d.nome || "Documento")}</b>
            <small>${n} página${n === 1 ? "" : "s"} · guardado em Meus documentos</small></span></span>
          <div class="conv-meta">${hora(it.t)}</div></button>`;
        continue;
      }
      if (it.k === "c") {
        const x = it.x;
        html += `<div class="conv-evento">📅 <b>${escaparHTML(x.titulo)}</b> marcada para ${dataBR(x.quando)}`
          + `${x.previsao || x.hora ? " · " + escaparHTML(x.previsao || x.hora) : ""}</div>`;
        continue;
      }
      const m = it.m;
      const meu = m.de === "paciente";
      html += `<div class="conv-bal ${meu ? "eu" : "ela"}">
        ${!meu && m.autor ? (m.autor.startsWith("🤖")
          ? `<div class="conv-autor auto">${escaparHTML(m.autor)}</div>`
          : `<div class="conv-autor">${escaparHTML(m.autor)} · Recepção</div>`) : ""}
        <div class="conv-txt">${linkar(escaparHTML(m.texto), m.de === "clinica").replace(/\n/g, "<br>")}</div>
        <div class="conv-meta">${hora(m.criado_em)}${meu ? " " + tique(m) : ""}</div>
      </div>`;
    }
    const ult = l[l.length - 1];
    if (ult && ult.de === "paciente") {
      html += `<div class="conv-status">${ult.entregue_em
        ? "✓✓ Recebida pela clínica. A resposta chega como aviso no celular."
        : "✓ Mensagem enviada. A recepção responde no horário de atendimento."}</div>`;
    }
    if (!l.length) {
      html += `<div class="conv-dica">Escreva sua mensagem para a recepção.
        A recepção responde no horário de atendimento, e a resposta chega como aviso no celular.</div>`;
    }
    if (window.DepoisConsulta) html += DepoisConsulta.htmlConversa(cv);
    if (window.PreConsulta) html += PreConsulta.htmlConversa(cv);
    c.msgs.innerHTML = html;
    if (!cv.ativa) mostrarEmojis(false);
    c.rodape.classList.toggle("escondido", !cv.ativa);
    c.fechado.classList.toggle("escondido", !!cv.ativa);
    if (rolar || perto) c.msgs.scrollTop = c.msgs.scrollHeight;
  }

  /* Quem desta clínica vê o acervo desta pessoa. O médico vê o acervo
     INTEIRO da pessoa, não exame a exame (sql/006 e 011): por autorização
     (sem código, até 12 meses) ou por código usado hoje. A liberação que
     o médico pediu nasce em `liberacoes` com tipo "autorizacao": o mesmo
     médico aparece uma vez só. */
  const mesma = (cv) => aberta && aberta.pessoa_id === cv.pessoa_id && aberta.clinica_id === cv.clinica_id;
  async function lerAcessos(cv) {
    const agora = new Date().toISOString();
    try {
      const [a, l] = await Promise.all([
        sb.from("autorizacoes").select("medico_nome, expira_em")
          .eq("pessoa_id", cv.pessoa_id).eq("clinica_id", cv.clinica_id)
          .is("revogado_em", null).gt("expira_em", agora),
        sb.from("liberacoes").select("medico_nome, expira_em")
          .eq("pessoa_id", cv.pessoa_id).eq("origem_clinica_id", cv.clinica_id)
          .not("usado_em", "is", null).is("revogado_em", null).gt("expira_em", agora),
        window.PreConsulta ? PreConsulta.atualizar(true) : null,
      ]);
      if (a.error || l.error) throw (a.error || l.error);
      const porMedico = new Map();
      for (const x of [...(a.data || []), ...(l.data || [])]) {
        const k = x.medico_nome || "Médico";
        if (!porMedico.has(k) || x.expira_em > porMedico.get(k).expira_em) porMedico.set(k, x);
      }
      for (const x of window.PreConsulta ? PreConsulta.liberadasDe(cv) : []) {
        const k = x.medico_nome || "Médico";
        porMedico.set(k, { medico_nome: x.medico_nome, expira_em: x.valido_ate,
                                                  consulta: x.id, qtd: (x.documento_ids || []).length });
      }
      if (mesma(cv)) { acessos = [...porMedico.values()]; desenharAcesso(); }
    } catch (e) { if (mesma(cv)) { acessos = null; desenharAcesso(); } }
  }

  function desenharAcesso() {
    const cv = aberta;
    if (!cv || !acessos) { c.acesso.classList.add("escondido"); return; }
    const n = (typeof documentos === "undefined" ? [] : documentos).filter((d) => d.pessoa_id === cv.pessoa_id).length;
    const docs = n + " documento" + (n === 1 ? "" : "s");
    let ico, tx, sub;
    const pergunta = window.PreConsulta && PreConsulta.perguntaDe(cv);
    acaoAcesso = null;
    if (!acessos.length && pergunta) {
      ico = "🔒"; tx = "Esta clínica não vê seus documentos";
      sub = "Toque para deixar o médico da consulta ver seus exames novos";
      acaoAcesso = () => PreConsulta.abrirLista(pergunta);
    } else if (!acessos.length) {
      ico = "🔒"; tx = "Esta clínica não vê seus documentos";
      sub = "Toque para mostrar ao médico na consulta";
    } else if (acessos.length === 1 && acessos[0].consulta) {
      const a = acessos[0];
      ico = "🔓"; tx = `${escaparHTML(a.medico_nome || "O médico")} vê ${a.qtd} exame${a.qtd === 1 ? "" : "s"} seu${a.qtd === 1 ? "" : "s"}`;
      sub = "só na consulta · toque para tirar o acesso";
      acaoAcesso = () => PreConsulta.revogar(a.consulta, a.medico_nome, a.qtd);
    } else if (acessos.length === 1) {
      const a = acessos[0], hoje = a.expira_em.slice(0, 10) <= new Date().toISOString().slice(0, 10);
      ico = "🔓"; tx = `${escaparHTML(a.medico_nome || "Um médico")} vê seus ${docs}`;
      sub = (hoje ? "até o fim do dia" : "até " + dataBR(a.expira_em.slice(0, 10))) + " · toque para ver ou tirar o acesso";
    } else {
      ico = "🔓"; tx = `${acessos.length} médicos daqui veem seus ${docs}`;
      sub = "Toque para ver quem e tirar o acesso";
    }
    c.acesso.className = "conv-acesso" + (acessos.length ? " livre" : "");
    c.acesso.innerHTML = `<span class="ico">${ico}</span><span class="tx">${tx}<small>${sub}</small></span><span class="seta">›</span>`;
  }

  // Tocar abre o Mostrar ao médico de sempre (gerar código, quem abriu,
  // autorizados com Cancelar), já na pessoa desta conversa.
  let acaoAcesso = null;
  c.acesso.onclick = () => {
    if (!aberta) return;
    if (acaoAcesso) return acaoAcesso();
    const pessoa = aberta.pessoa_id;
    q("btn-mostrar").click();
    try { mvPessoa = pessoa; desenharMvPessoas(); } catch (e) {}
  };
  // Fechou o Mostrar (botão ou voltar do celular): a linha relê o acesso.
  new MutationObserver(() => {
    if (aberta && q("tela-mostrar").classList.contains("escondido")) lerAcessos(aberta);
  }).observe(q("tela-mostrar"), { attributes: true, attributeFilter: ["class"] });

  // Balão de documento: abre o visualizador de sempre (app.js).
  c.msgs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-doc]");
    if (!b) return;
    const d = documentos.find((x) => x.id === b.dataset.doc);
    if (d) abrirDocumento(d);
  });

  async function marcarLidas(cv) {
    if (!naoLidas(cv)) return;
    const { error } = await sb.rpc("marcar_mensagens_lidas", { p_pessoa: cv.pessoa_id, p_clinica: cv.clinica_id });
    if (!error) {
      const agora = new Date().toISOString();
      for (const m of daConversa(cv)) if (m.de === "clinica" && !m.lida_em) m.lida_em = agora;
      pintarBadge();
    }
  }

  function abrirConversa(cv) {
    aberta = cv;
    tela.classList.remove("como-aba");
    c.voltar.classList.remove("escondido");
    for (const id of ["conv-ini-conta", "conv-fab"]) q(id).classList.add("escondido");
    mostrarEmojis(false);
    acessos = null;
    desenharConversa(true);
    lerAcessos(cv);
    marcarLidas(cv);
    agendar();
  }

  function agendar() {
    clearInterval(timer);
    // Aberta, a conversa se atualiza a cada 10 s; a lista, a cada 30 s.
    timer = setInterval(atualizar, aberta ? 10000 : 30000);
  }

  async function atualizar() {
    if (tela.classList.contains("escondido") || document.hidden) return;
    try {
      await carregar();
      if (aberta) {
        aberta = conversas.find((x) => x.pessoa_id === aberta.pessoa_id && x.clinica_id === aberta.clinica_id) || aberta;
        desenharConversa(false);
        marcarLidas(aberta);
      } else {
        desenharLista();
      }
    } catch (e) { /* sem rede: fica o que está na tela */ }
  }

  async function abrir(pessoaId, clinicaId) {
    tela.classList.remove("escondido");
    c.lista.innerHTML = '<div class="conv-carregando">Carregando…</div>';
    try {
      await carregar();
    } catch (e) {
      c.lista.innerHTML = '<div class="conv-vazio"><b>Sem conexão agora</b><p>As conversas precisam de internet. Tente de novo em instantes.</p></div>';
      return;
    }
    const alvo = pessoaId && conversas.find((x) => x.pessoa_id === pessoaId && x.clinica_id === clinicaId);
    if (alvo) abrirConversa(alvo);
    else { aberta = null; desenharLista(); agendar(); }
  }

  function fechar() {
    clearInterval(timer);
    aberta = null;
    if (noInicio) { desenharLista(); agendar(); return; }   // o início não fecha
    tela.classList.add("escondido");
  }

  function inicio() {
    noInicio = true;
    if (window.PreConsulta) PreConsulta.atualizar();
    if (window.DepoisConsulta) DepoisConsulta.atualizar();
    if (!tela.classList.contains("escondido") && aberta) return;   // uma conversa aberta continua
    tela.classList.add("como-aba");
    abrir();
  }
  function sairDoInicio() {
    noInicio = false;
    tela.classList.remove("como-aba");
    fechar();
  }
  q("conv-ini-conta").onclick = () => q("btn-conta").click();
  q("conv-fab").onclick = () => { if (window.Abas) Abas.ir("documentos"); q("btn-fotografar").click(); };

  c.voltar.onclick = () => {
    if (aberta) { aberta = null; desenharLista(); agendar(); return; }
    fechar();
  };

  // Painel de emojis no lugar do teclado, como no WhatsApp: 😊 abre (e
  // recolhe o teclado), ⌨️ ou tocar no campo volta ao teclado.
  let cursor = null;
  function mostrarEmojis(sim) {
    c.emojis.classList.toggle("escondido", !sim);
    c.btnEmoji.textContent = sim ? "⌨️" : "😊";
    c.btnEmoji.setAttribute("aria-label", sim ? "Teclado" : "Emojis");
  }
  for (const e of EMOJIS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = e;
    b.onclick = () => {
      const v = c.campo.value;
      const i = cursor == null ? v.length : cursor;
      c.campo.value = v.slice(0, i) + e + v.slice(i);
      cursor = i + e.length;
      ajustarCampo();
    };
    c.emojis.appendChild(b);
  }
  c.btnEmoji.onclick = () => {
    const abrir = c.emojis.classList.contains("escondido");
    if (abrir) { cursor = c.campo.selectionStart; c.campo.blur(); }
    mostrarEmojis(abrir);
    if (!abrir) c.campo.focus();
  };
  c.campo.addEventListener("focus", () => mostrarEmojis(false));
  c.campo.addEventListener("blur", () => { cursor = c.campo.selectionStart; });

  function ajustarCampo() {
    c.campo.style.height = "auto";
    c.campo.style.height = Math.min(c.campo.scrollHeight, 120) + "px";
    c.enviar.disabled = !c.campo.value.trim() || enviando;
  }
  c.campo.addEventListener("input", ajustarCampo);

  const ERROS = {
    SEM_RECEBIMENTO: "Esta clínica não está mais autorizada a falar com você. Veja em Mostrar ao médico → Clínicas.",
    LIMITE_DIARIO: "Você já mandou muitas mensagens hoje. A recepção vai responder as que chegaram.",
    TEXTO_LONGO: "A mensagem ficou longa demais. Tente dividir em duas.",
  };
  c.enviar.onclick = async () => {
    const texto = c.campo.value.trim();
    if (!texto || !aberta || enviando) return;
    if (!navigator.onLine) return aviso("Sem conexão agora. A mensagem continua aí; envie quando a internet voltar.", "erro");
    enviando = true;
    ajustarCampo();
    const { error } = await sb.rpc("enviar_mensagem", {
      p_pessoa: aberta.pessoa_id, p_clinica: aberta.clinica_id,
      p_assunto: /remarc/i.test(texto) ? "remarcar" : /\?|d[úu]vida/i.test(texto) ? "duvida" : "outro",
      p_texto: texto,
    });
    enviando = false;
    if (error) {
      const cod = Object.keys(ERROS).find((k) => (error.message || "").includes(k));
      aviso(cod ? ERROS[cod] : "Não consegui enviar agora. Tente de novo.", "erro");
      ajustarCampo();
      return;
    }
    c.campo.value = "";
    cursor = null;
    ajustarCampo();
    try { await carregar(); } catch (e) { /* a mensagem já foi; aparece na próxima atualização */ }
    aberta = conversas.find((x) => x.pessoa_id === aberta.pessoa_id && x.clinica_id === aberta.clinica_id) || aberta;
    desenharConversa(true);
    // A clínica recebe em segundos (e o assistente avisa): olha de novo logo.
    setTimeout(atualizar, 3000);
    setTimeout(atualizar, 8000);
  };
  // Enter envia no computador; no celular o Enter quebra a linha (teclado virtual).
  c.campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) { e.preventDefault(); c.enviar.click(); }
  });

  // Botão no cabeçalho, e o voltar do Android fecha a tela (app.js).
  const botao = q("btn-conversa");
  if (botao) botao.onclick = () => abrir();
  if (typeof FECHAR_TELA_CHEIA === "object") FECHAR_TELA_CHEIA["tela-conversa"] = "conv-voltar";

  // Aviso tocado com o app fechado: o service worker abre "#conversa=p,c".
  function pelaUrl() {
    const m = /#conversa=([^&]+)/.exec(location.hash);
    if (!m) return false;
    const [p, cl] = decodeURIComponent(m[1]).split(",");
    history.replaceState(history.state, "", location.pathname + location.search);
    esperarLogin(() => abrir(p, cl));
    return true;
  }
  // A sessão e as pessoas da conta chegam depois de o script rodar.
  function esperarLogin(fn, tentativas = 40) {
    sb.auth.getSession().then(({ data }) => {
      if (data && data.session && pessoas.length) return fn();
      if (tentativas > 0) setTimeout(() => esperarLogin(fn, tentativas - 1), 500);
    });
  }
  // Aviso tocado com o app aberto: o service worker manda uma mensagem.
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", (e) => {
      const d = e.data || {};
      if (d.abrir === "conversa") esperarLogin(() => abrir(d.pessoa_id, d.clinica_id));
    });
  }

  // Contador de não lidas no cabeçalho: ao abrir, ao voltar ao app e a cada 2 min.
  function contarNaoLidas() {
    esperarLogin(() => carregar().catch(() => {}), 20);
  }
  pelaUrl();
  contarNaoLidas();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { contarNaoLidas(); atualizar(); } });
  setInterval(() => { if (!document.hidden && tela.classList.contains("escondido")) carregar().catch(() => {}); }, 120000);

  // A agenda chega depois da lista: redesenha a faixa da consulta e a
  // indicação quando ela chega (app.js chama).
  function redesenharInicio() {
    if (noInicio && !aberta && !tela.classList.contains("escondido")) desenharLista();
  }
  function redesenharConversa() {
    if (aberta && !tela.classList.contains("escondido")) { desenharConversa(false); lerAcessos(aberta); }
  }
  window.Conversa = { abrir, inicio, sairDoInicio, redesenharInicio, redesenharConversa,
                      naLista: () => noInicio && !aberta };
})();
