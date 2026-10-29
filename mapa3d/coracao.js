/*
 * Mapa anatômico 3D do prontuário (Indiclin, 23/10/2026) — nasceu ❤️ Coração
 * 3D e virou o visualizador de todas as especialidades: o médico gira o
 * desenho, seleciona regiões, pinta achados, põe marcas com texto e
 * descreve os achados reais dos exames. Representação ilustrativa do laudo.
 *
 * Cada MODELO (coração, nariz e seios…) é uma função que desenha a forma
 * (MODELOS, abaixo) + o catálogo que o servidor manda (regiões, achados,
 * cores, escore — modules/mapas_modelos.py). O resto é o mesmo para todos.
 *
 * O servidor (modules/mapas_anatomicos.py) manda "coracao_dados" (catálogo +
 * mapas do paciente); a tela devolve coracao_salvar / coracao_inativar /
 * coracao_texto / coracao_extrair (os nomes ficaram do coração).
 * O three.js (MIT, servido em /coracao) só carrega quando a aba abre.
 * Todo texto entra por textContent (nada de HTML montado com dado digitado).
 *
 * MODO PACIENTE (24/10/2026): o app do indiDoc usa ESTE arquivo (cópia em
 * exames_externos/app/mapa3d/, conferida por teste) para mostrar o mapa mais
 * recente em 3D: window.MapaAnatomico.mostrar(dados) — só leitura, sem
 * Shiny, sem botões do médico.
 */
(function () {
  if (window.__coracao3d) return;
  window.__coracao3d = true;

  var S = {
    cat: null, mapas: [], pid: "", atual: null, modo: "selecionar", pincel: "", sel: null,
    three: null, prontoThree: false, dirty: false,
    ia: false, fontes: [], linhaTempo: [], extraindo: false, sugestao: null, tocando: null,
    modelo: "", modelos: [], indidocAuto: false, indidocAtivo: false,
    plano: {}, planoPaciente: [],   // 🩺 plano de cuidado: {mapa_id: {sugestoes, aceitas}} / o combinado
    paciente: !!window.__mapaPaciente   // app do indiDoc: só leitura
  };
  var G = {}; // objetos do three.js

  // ── utilidades de DOM (sempre textContent) ─────────────────────────────
  function el(tag, props, kids) {
    var e = document.createElement(tag);
    props = props || {};
    for (var k in props) {
      if (k === "text") e.textContent = props[k];
      else if (k === "cls") e.className = props[k];
      else if (k === "style") e.setAttribute("style", props[k]);
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), props[k]);
      else e.setAttribute(k, props[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function limpar(e) { while (e.firstChild) e.removeChild(e.firstChild); }
  function hoje() {
    var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  function br(iso) { iso = String(iso || ""); return iso.length >= 10 ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : iso; }
  function regiao(id) { return (S.cat.regioes || []).filter(function (r) { return r.id === id; })[0]; }
  function achadosDo(grupo) { return (S.cat.achados || {})[grupo] || []; }
  function achado(grupo, cod) { return achadosDo(grupo).filter(function (a) { return a[0] === cod; })[0]; }
  function exameNome(cod) { var e = (S.cat.exames || []).filter(function (x) { return x[0] === cod; })[0]; return e ? e[1] : cod; }
  function editavel() { return !S.consulta && !!S.atual && (S.atual.id ? !!S.atual.editavel : true); }
  function aviso(txt) { var a = document.getElementById("cor_aviso"); if (a) a.textContent = txt || ""; }

  var CSS = [
    ".coracao-app{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px}",
    ".cor-palco{flex:1 1 420px;min-width:300px;position:relative;border:1px solid #e2e8f0;border-radius:10px;",
    "background:radial-gradient(circle at 50% 40%,#ffffff,#eef2f6);height:520px;overflow:hidden}",
    ".cor-palco canvas{display:block;touch-action:none}",
    ".cor-barra{position:absolute;top:8px;left:8px;right:8px;display:flex;flex-wrap:wrap;gap:4px;z-index:2}",
    ".cor-barra button,.cor-barra select{font-size:12px;padding:3px 8px;border:1px solid #cbd5e1;border-radius:6px;background:#fff}",
    ".cor-barra button.on{background:#b91c1c;color:#fff;border-color:#b91c1c}",
    ".cor-dica{position:absolute;left:8px;bottom:8px;font-size:11px;color:#64748b;z-index:2;max-width:70%}",
    ".cor-tip{position:absolute;pointer-events:none;background:#1f2937;color:#fff;font-size:11px;padding:2px 6px;border-radius:4px;z-index:3;display:none}",
    ".cor-lado{flex:1 1 320px;min-width:280px;font-size:13px}",
    ".cor-lado .card{border:1px solid #e2e8f0;border-radius:10px;padding:10px;margin-bottom:8px;background:#fff}",
    ".cor-lado h6{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0 0 6px}",
    ".cor-lado select,.cor-lado input,.cor-lado textarea{box-sizing:border-box;width:100%;font-size:13px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:6px}",
    ".cor-lado .linha{display:flex;gap:6px;align-items:center}",
    ".cor-lado .linha>*{flex:1}",
    ".cor-achado{display:flex;gap:6px;align-items:flex-start;padding:4px 0;border-bottom:1px solid #f1f5f9;cursor:pointer}",
    ".cor-achado:hover{background:#f8fafc}",
    ".cor-pinta{width:12px;height:12px;border-radius:3px;flex:0 0 12px;margin-top:3px;border:1px solid rgba(0,0,0,.2)}",
    ".cor-sub{font-size:11px;color:#64748b}",
    ".cor-bts{display:flex;flex-wrap:wrap;gap:6px}",
    ".cor-bts button{font-size:12px;padding:4px 10px;border-radius:6px;border:1px solid #cbd5e1;background:#fff}",
    ".cor-bts button.pri{background:#b91c1c;color:#fff;border-color:#b91c1c}",
    ".cor-legenda{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:11px;color:#475569}",
    ".cor-legenda span{display:inline-flex;align-items:center;gap:4px}",
    "#cor_aviso{font-size:12px;color:#b45309;min-height:16px}",
    ".coracao-overlay{position:fixed;inset:0;z-index:1055;background:#f8fafc;padding:10px 14px;overflow:auto}",
    ".coracao-topo{gap:10px;margin-bottom:4px}",
    ".coracao-overlay .cor-palco{height:calc(100vh - 230px);min-height:380px}",
    ".cor-esq{flex:1 1 420px;min-width:300px;display:flex;flex-direction:column;gap:8px}",
    ".cor-esq .cor-palco{flex:none;min-width:0}",
    ".cor-tempo{border:1px solid #e2e8f0;border-radius:10px;background:#fff;padding:8px 10px;font-size:12px}",
    ".cor-tempo .trilho{display:flex;align-items:center;gap:6px;overflow-x:auto;padding:4px 0}",
    ".cor-tempo .ponto{white-space:nowrap;border:1px solid #cbd5e1;border-radius:999px;padding:2px 10px;background:#fff;cursor:pointer;font-size:12px}",
    ".cor-tempo .ponto.on{background:#b91c1c;color:#fff;border-color:#b91c1c}",
    ".cor-tempo .liga{flex:0 0 18px;height:2px;background:#cbd5e1}",
    ".cor-tempo ul{margin:4px 0 0;padding-left:18px}",
    ".cor-ia{background:#fff7ed;border-color:#fed7aa!important}",
    ".cor-sugestao{background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:6px 8px;font-size:12px;margin-top:6px}"
  ].join("");

  // ── montagem da tela ──────────────────────────────────────────────────
  function montar() {
    var root = document.getElementById("coracao_app");
    if (!root || root.getAttribute("data-montado")) return !!root;
    root.setAttribute("data-montado", "1");
    root.appendChild(el("style", { text: CSS }));
    var palco = el("div", { cls: "cor-palco", id: "cor_palco" });
    var barra = el("div", { cls: "cor-barra" });
    if (!S.paciente) {
      [["selecionar", "👆 Selecionar"], ["pintar", "🖌️ Pintar"], ["marcar", "📍 Marcar"]].forEach(function (m) {
        barra.appendChild(el("button", { type: "button", "data-modo": m[0], text: m[1], onclick: function () { modo(m[0]); } }));
      });
      barra.appendChild(el("select", { id: "cor_pincel", title: "Achado do pincel", onchange: function (e) { S.pincel = e.target.value; legenda(); } }));
    }
    barra.appendChild(el("span", { id: "cor_vistas", style: "display:inline-flex;gap:4px;flex-wrap:wrap" }));
    palco.appendChild(barra);
    palco.appendChild(el("div", { cls: "cor-tip", id: "cor_tip" }));
    palco.appendChild(el("div", { cls: "cor-dica", id: "cor_dica",
      text: "Arraste para girar · roda do mouse aproxima · clique numa região. Representação ilustrativa do laudo — não substitui o exame." }));
    var lado = el("div", { cls: "cor-lado", id: "cor_lado" });
    var esq = el("div", { cls: "cor-esq" }, [palco, el("div", { id: "cor_tempo" })]);
    root.appendChild(esq);
    root.appendChild(lado);
    modo("selecionar");
    return true;
  }

  function modo(m) {
    S.modo = m;
    document.querySelectorAll(".cor-barra button[data-modo]").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-modo") === m);
    });
    var p = document.getElementById("cor_pincel");
    if (p) p.style.display = m === "pintar" ? "" : "none";
    var d = document.getElementById("cor_dica");
    if (d && S.paciente) d.textContent = "Arraste para girar · dois dedos (ou ＋ －) para aproximar · toque numa região para ver o achado. "
      + "Representação ilustrativa do laudo — não substitui o exame nem a conversa com o seu médico.";
    else if (d) d.textContent = {
      selecionar: "Clique numa região para ver e descrever o achado. Arraste para girar.",
      pintar: "Escolha o achado e clique nas regiões para pintar. Clique de novo com o mesmo achado para apagar.",
      marcar: "Clique no desenho para pôr uma marca; escreva o texto dela no painel."
    }[m] + " Representação ilustrativa do laudo — não substitui o exame.";
  }

  function preencherPincel() {
    var p = document.getElementById("cor_pincel");
    if (!p || !S.cat) return;
    limpar(p);
    Object.keys(S.cat.grupos).forEach(function (g) {
      var og = el("optgroup", { label: S.cat.grupos[g] });
      achadosDo(g).forEach(function (a) { og.appendChild(el("option", { value: g + "|" + a[0], text: a[1] })); });
      p.appendChild(og);
    });
    if (!S.pincel) S.pincel = p.value;
    p.value = S.pincel;
  }

  // ── painel lateral ────────────────────────────────────────────────────
  function painel() {
    var lado = document.getElementById("cor_lado");
    if (!lado || !S.cat) return;
    limpar(lado);
    if (S.paciente) return painelPaciente(lado);
    if (!S.pid) { lado.appendChild(el("div", { cls: "card", text: "Abra um paciente para usar o mapa." })); return; }

    // mapas do paciente (e a troca de modelo, quando a clínica tem mais de um)
    var c1 = el("div", { cls: "card" }, [el("h6", { text: "Mapas do paciente" })]);
    if (S.modelos.length > 1) {
      c1.appendChild(el("div", { cls: "cor-bts", style: "margin-bottom:6px" }, S.modelos.map(function (m) {
        return el("button", { type: "button", cls: m.id === S.modelo ? "pri" : "", text: m.icone + " " + m.nome,
          onclick: function () { trocarModelo(m.id); } });
      })));
    }
    var sel = el("select", { id: "cor_mapas", onchange: function (e) { abrirMapa(e.target.value); } });
    sel.appendChild(el("option", { value: "", text: S.mapas.length ? "— escolha um mapa —" : "Nenhum mapa ainda" }));
    S.mapas.forEach(function (m) {
      sel.appendChild(el("option", { value: m.id, text: exameNome(m.exame_tipo) + " · " + br(m.exame_data)
        + (m.autor_nome ? " · " + m.autor_nome : "") + (m.inativo_em ? " (inativo)" : "") }));
    });
    if (S.atual && S.atual.id) sel.value = S.atual.id;
    c1.appendChild(sel);
    if (S.consulta) c1.appendChild(el("div", { cls: "cor-sub", text: "Somente consulta — mapa de outra especialidade." }));
    else c1.appendChild(el("div", { cls: "cor-bts" }, [
      el("button", { type: "button", text: "➕ Novo mapa", onclick: function () { novo(false); } }),
      S.atual ? el("button", { type: "button", text: "⧉ Copiar para novo exame", title: "Começa um mapa novo com os achados deste",
        onclick: function () { novo(true); } }) : null
    ]));
    lado.appendChild(c1);
    if (S.ia && !S.consulta) lado.appendChild(cartaoIA());
    if (!S.atual) { lado.appendChild(el("div", { id: "cor_aviso" })); return; }
    var ed = editavel();

    // exame
    var c2 = el("div", { cls: "card" }, [el("h6", { text: "Exame" })]);
    var tipo = el("select", { onchange: function (e) { S.atual.exame_tipo = e.target.value; sujo(); } });
    (S.cat.exames || []).forEach(function (x) { tipo.appendChild(el("option", { value: x[0], text: x[1] })); });
    tipo.value = S.atual.exame_tipo || ((S.cat.exames || [])[0] || [""])[0];
    S.atual.exame_tipo = tipo.value;
    var data = el("input", { type: "date", max: hoje(), value: S.atual.exame_data || hoje(),
      onchange: function (e) { S.atual.exame_data = e.target.value; sujo(); } });
    S.atual.exame_data = data.value;
    if (!ed) { tipo.disabled = true; data.disabled = true; }
    c2.appendChild(el("div", { cls: "linha" }, [tipo, data]));
    if (!S.atual.id && S.atual.origem === "ia") c2.appendChild(el("div", { cls: "cor-sugestao",
      text: "✨ Sugerido pela IA a partir de: " + ((S.sugestao && (S.sugestao.titulo + " · " + br(S.sugestao.data))) || "laudo")
        + ". Revise cada achado no desenho e corrija o que for preciso antes de salvar — nada vale sem o 💾 Salvar." }));
    else if (S.atual.origem === "ia") c2.appendChild(el("div", { cls: "cor-sub", text: "✨ Mapa feito a partir de extração por IA, revisado e salvo pelo médico." }));
    if (S.atual.inativo_em) c2.appendChild(el("div", { cls: "cor-sub", text: "Inativo: " + (S.atual.inativo_motivo || "") }));
    else if (S.atual.id && !ed && !S.consulta) c2.appendChild(el("div", { cls: "cor-sub", text: "Só quem criou pode alterar. Use ⧉ Copiar para um novo." }));
    lado.appendChild(c2);

    // região selecionada
    var c3 = el("div", { cls: "card" }, [el("h6", { text: "Região" })]);
    var esc = el("select", { onchange: function (e) { selecionar(e.target.value || null); } });
    esc.appendChild(el("option", { value: "", text: "— clique no desenho ou escolha —" }));
    Object.keys(S.cat.grupos).forEach(function (g) {
      var og = el("optgroup", { label: S.cat.grupos[g] });
      S.cat.regioes.filter(function (r) { return r.grupo === g; }).forEach(function (r) {
        og.appendChild(el("option", { value: r.id, text: r.nome }));
      });
      esc.appendChild(og);
    });
    esc.value = S.sel || "";
    c3.appendChild(esc);
    if (S.sel) {
      var r = regiao(S.sel), v = S.atual.regioes[S.sel] || { achado: "", nota: "" };
      var ach = el("select", { onchange: function (e) { definir(S.sel, e.target.value, null); } });
      ach.appendChild(el("option", { value: "", text: "— sem achado —" }));
      achadosDo(r.grupo).forEach(function (a) { ach.appendChild(el("option", { value: a[0], text: a[1] })); });
      ach.value = v.achado || "";
      var nota = el("textarea", { rows: "2", maxlength: "500", placeholder: S.cat.dica_nota || "Descreva",
        oninput: function (e) { definir(S.sel, null, e.target.value, true); } });
      nota.value = v.nota || "";
      if (!ed) { ach.disabled = true; nota.disabled = true; }
      c3.appendChild(ach);
      c3.appendChild(nota);
    }
    lado.appendChild(c3);

    // lista de achados
    var c4 = el("div", { cls: "card" }, [el("h6", { text: "Achados deste mapa" })]);
    var esc4 = escore();
    if (esc4) c4.appendChild(el("div", { cls: "cor-sugestao", style: "background:#eff6ff;border-color:#bfdbfe;margin:0 0 6px",
      text: esc4.texto ? "📊 " + esc4.texto : "📊 " + esc4.nome + ": " + esc4.total + " de " + esc4.max + " (" + Object.keys(esc4.lados).map(function (k) { return k + " " + esc4.lados[k]; }).join(" · ") + ")"
        + (esc4.sem ? " — " + esc4.sem + " região(ões) ainda sem marcação (contam 0)" : "") }));
    var ids = S.cat.regioes.map(function (r) { return r.id; }).filter(function (id) { return S.atual.regioes[id]; });
    if (!ids.length && !S.atual.marcas.length) c4.appendChild(el("div", { cls: "cor-sub", text: "Nada ainda. Pinte, marque ou selecione uma região." }));
    ids.forEach(function (id) {
      var r = regiao(id), v = S.atual.regioes[id], a = achado(r.grupo, v.achado);
      c4.appendChild(el("div", { cls: "cor-achado", onclick: function () { selecionar(id); } }, [
        el("span", { cls: "cor-pinta", style: "background:" + (a ? a[2] : "#e2e8f0") }),
        el("div", {}, [el("div", { text: r.nome + (a ? " — " + a[1] : "") }),
          v.nota ? el("div", { cls: "cor-sub", text: v.nota }) : null])
      ]));
    });
    S.atual.marcas.forEach(function (m, i) {
      var linha = el("div", { cls: "cor-achado" }, [
        el("span", { style: "flex:0 0 14px;font-size:12px", text: "📍" }),
        el("div", { style: "flex:1" }, [
          el("div", { cls: "cor-sub", text: "Marca " + (i + 1) + (m.regiao && regiao(m.regiao) ? " · " + regiao(m.regiao).nome : "") }),
          (function () {
            var t = el("input", { type: "text", maxlength: "300", placeholder: "Texto da marca", value: m.texto || "",
              oninput: function (e) { m.texto = e.target.value; sujo(true); } });
            if (!ed) t.disabled = true;
            t.id = "cor_marca_" + m.id;
            return t;
          })()
        ]),
        ed ? el("button", { type: "button", text: "✕", title: "Tirar a marca", style: "border:0;background:none;color:#b91c1c",
          onclick: function () { S.atual.marcas.splice(i, 1); desenharMarcas(); sujo(); painel(); } }) : null
      ]);
      c4.appendChild(linha);
    });
    var obs = el("textarea", { rows: "3", maxlength: "2000", placeholder: "Observações gerais do exame",
      oninput: function (e) { S.atual.observacoes = e.target.value; sujo(true); } });
    obs.value = S.atual.observacoes || "";
    if (!ed) obs.disabled = true;
    c4.appendChild(obs);
    lado.appendChild(c4);
    if (S.atual.id && S.plano[S.atual.id]) lado.appendChild(cartaoPlano(S.plano[S.atual.id]));

    // legenda e ações
    lado.appendChild(el("div", { cls: "card" }, [el("h6", { text: "Legenda" }), el("div", { cls: "cor-legenda", id: "cor_legenda" })]));
    var bts = el("div", { cls: "cor-bts" });
    if (ed) bts.appendChild(el("button", { type: "button", cls: "pri", text: "💾 Salvar", onclick: salvar }));
    // 📱 opção do médico: o mapa vai ao indiDoc sozinho a cada 💾 Salvar
    if (ed && S.indidocAtivo) bts.appendChild(el("label", { title: "A imagem do desenho e os achados vão ao indiDoc do paciente a cada 💾 Salvar",
      style: "display:inline-flex;align-items:center;gap:4px;font-size:12px" }, [
      (function () {
        var c = el("input", { type: "checkbox", id: "cor_indidoc_auto", onchange: function (e) {
          S.indidocAuto = !!e.target.checked;
          Shiny.setInputValue("coracao_indidoc_auto", { ligado: S.indidocAuto, t: Date.now() }, { priority: "event" });
        } });
        c.checked = !!S.indidocAuto;
        return c;
      })(),
      el("span", { text: "📱 Enviar ao paciente ao salvar" })]));
    if (S.atual.id) bts.appendChild(el("button", { type: "button", text: "📝 Levar ao texto da consulta",
      onclick: function () { if (S.dirty) { aviso("Salve antes de levar ao texto."); return; }
        Shiny.setInputValue("coracao_texto", { id: S.atual.id, t: Date.now() }, { priority: "event" }); } }));
    // 📱 Enviar ao paciente (24/10/2026): a imagem do desenho como está na
    // tela (fundo branco: o canvas é transparente) e os achados vão ao indiDoc
    if (S.atual.id && ed && !S.dirty && !S.atual.inativo_em) bts.appendChild(el("button", { type: "button",
      text: "📱 Enviar ao paciente", title: "A imagem do desenho e os achados vão ao indiDoc do paciente",
      onclick: function () {
        if (!window.confirm("Enviar este mapa (imagem e achados) ao indiDoc do paciente?")) return;
        var img = capturar();
        if (!img) return;
        Shiny.setInputValue("coracao_indidoc", { id: S.atual.id, imagem: img, t: Date.now() }, { priority: "event" });
      } }));
    if (S.atual.id && ed) bts.appendChild(el("button", { type: "button", text: "🚫 Inativar", onclick: function () {
      var mot = window.prompt("Motivo para inativar este mapa (fica registrado):");
      if (mot && mot.trim()) Shiny.setInputValue("coracao_inativar", { id: S.atual.id, motivo: mot.trim(), t: Date.now() }, { priority: "event" });
    } }));
    lado.appendChild(el("div", { cls: "card" }, [bts, el("div", { id: "cor_aviso" })]));
    legenda();
    linhaTempo();
    if (S.dirty) aviso("Alterações não salvas.");
  }

  // ── 🩺 plano de cuidado: o mapa salvo sugere, o médico aceita ou descarta ──
  function dm(iso) { iso = String(iso || ""); return iso.length >= 10 ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : ""; }
  function planoAcao(acao, s) {
    var dados = { acao: acao, mapa: S.atual.id, regra: s.regra_id, origem: "mapa", t: Date.now() };
    if (acao === "descartar") {
      var m = window.prompt("Motivo do descarte (opcional):", "");
      if (m === null) return;
      dados.motivo = m;
    }
    Shiny.setInputValue("plano_acao", dados, { priority: "event" });
  }
  function cartaoPlano(pl) {
    var c = el("div", { cls: "card" }, [el("h6", { text: "🩺 Plano de cuidado" })]);
    if (S.dirty) c.appendChild(el("div", { cls: "cor-sub", text: "Salve o mapa para atualizar as sugestões." }));
    var sugs = pl.sugestoes || [], ac = pl.aceitas || [];
    if (!sugs.length && !ac.length) c.appendChild(el("div", { cls: "cor-sub", text: "Nenhuma sugestão para este mapa." }));
    sugs.forEach(function (s) {
      var partes = [];
      if ((s.exames || []).length) partes.push("📋 " + s.exames.map(function (e) { return e.nome; }).join(", "));
      if (s.retorno_dias) partes.push("📅 retorno em " + s.retorno_dias + " dias (" + dm(s.retorno_em) + ")");
      if ((s.ja_pedidos || []).length) partes.push("já pedido: " + s.ja_pedidos.join(", "));
      c.appendChild(el("div", { cls: "cor-achado", style: "display:block" }, [
        el("div", { style: "font-weight:600", text: s.nome }),
        el("div", { cls: "cor-sub", text: s.motivo }),
        el("div", { text: partes.join(" · ") }),
        s.texto_paciente ? el("div", { cls: "cor-sub", style: "font-style:italic", text: "Para o paciente: " + s.texto_paciente }) : null,
        el("div", { cls: "cor-bts" }, [
          el("button", { type: "button", text: "✅ Aceitar", onclick: function () { planoAcao("aceitar", s); } }),
          el("button", { type: "button", text: "✖ Descartar", onclick: function () { planoAcao("descartar", s); } })])
      ]));
    });
    ac.forEach(function (a) {
      var det = (a.exames || []).filter(Boolean).join(", ");
      if (a.retorno_em) det += (det ? " · " : "") + "retorno " + dm(a.retorno_em);
      c.appendChild(el("div", { cls: "cor-sub", style: "color:#15803d", text: "✔ Combinado: " + a.nome + (det ? " (" + det + ")" : "") }));
    });
    if (ac.length) c.appendChild(el("div", { cls: "cor-sub", text: "O combinado vai ao paciente no próximo 📱 envio do mapa." }));
    return c;
  }

  // ── add-on: extrair do laudo com IA ───────────────────────────────────
  function cartaoIA() {
    var c = el("div", { cls: "card cor-ia" }, [el("h6", { text: "✨ Extrair do laudo (IA)" })]);
    if (!S.fontes.length) {
      c.appendChild(el("div", { cls: "cor-sub", text: S.cat.sem_fonte || "Este paciente não tem laudo com texto no sistema para este mapa." }));
      return c;
    }
    var sel = el("select", { id: "cor_fonte" });
    S.fontes.forEach(function (f) { sel.appendChild(el("option", { value: f.id, text: f.titulo + " · " + br(f.data) })); });
    c.appendChild(sel);
    c.appendChild(el("div", { cls: "cor-bts" }, [el("button", { type: "button", cls: "pri", id: "cor_extrair",
      text: S.extraindo ? "⏳ Lendo o laudo…" : "✨ Extrair achados", onclick: function () {
        if (S.extraindo) return;
        if (S.dirty && !window.confirm("Há alterações não salvas. Extrair um novo rascunho mesmo assim?")) return;
        S.extraindo = true; painel();
        Shiny.setInputValue("coracao_extrair", { paciente_id: S.pid, fonte_id: sel.value, modelo: S.modelo, t: Date.now() }, { priority: "event" });
      } })]));
    c.appendChild(el("div", { cls: "cor-sub", text: "A IA lê o laudo (sem nome nem CPF do paciente) e monta um rascunho no desenho. Você revisa e salva." }));
    if (S.extraindo) c.querySelector("#cor_extrair").disabled = true;
    return c;
  }

  // ── add-on: linha do tempo ────────────────────────────────────────────
  // Modo paciente: o exame, o escore e os achados em texto — nada editável
  function painelPaciente(lado) {
    if (!S.atual) { lado.appendChild(el("div", { cls: "card", text: "Mapa sem dados." })); return; }
    lado.appendChild(el("div", { cls: "card" }, [el("h6", { text: "Exame" }),
      el("div", { text: exameNome(S.atual.exame_tipo) + " · " + br(S.atual.exame_data) })]));
    var c = el("div", { cls: "card" }, [el("h6", { text: "Achados" })]);
    var esc = escore();
    if (esc) c.appendChild(el("div", { cls: "cor-sugestao", style: "background:#eff6ff;border-color:#bfdbfe;margin:0 0 6px",
      text: "📊 " + (esc.texto || (esc.nome + ": " + esc.total + " de " + esc.max)) }));
    var ids = S.cat.regioes.map(function (r) { return r.id; }).filter(function (id) { return S.atual.regioes[id]; });
    if (!ids.length && !S.atual.marcas.length) c.appendChild(el("div", { cls: "cor-sub", text: "Nenhum achado marcado." }));
    ids.forEach(function (id) {
      var r = regiao(id), v = S.atual.regioes[id], a = r && achado(r.grupo, v.achado);
      if (!r) return;
      c.appendChild(el("div", { cls: "cor-achado" + (S.sel === id ? " on" : ""), onclick: function () { selecionar(id); } }, [
        el("span", { cls: "cor-pinta", style: "background:" + (a ? a[2] : "#e2e8f0") }),
        el("div", {}, [el("div", { text: r.nome + (a ? " — " + a[1] : "") }),
          v.nota ? el("div", { cls: "cor-sub", text: v.nota }) : null])
      ]));
    });
    S.atual.marcas.forEach(function (m, i) {
      if (!m.texto) return;
      c.appendChild(el("div", { cls: "cor-achado" }, [el("span", { style: "flex:0 0 14px;font-size:12px", text: "📍" }),
        el("div", { text: (i + 1) + ". " + m.texto })]));
    });
    lado.appendChild(c);
    if (S.atual.observacoes) lado.appendChild(el("div", { cls: "card" }, [el("h6", { text: "Observações" }),
      el("div", { text: S.atual.observacoes })]));
    // 🩺 só o que o médico aceitou (o pedido e a agenda continuam no app, sem repetir)
    if ((S.planoPaciente || []).length) {
      var pc = el("div", { cls: "card" }, [el("h6", { text: "Plano combinado com o seu médico" })]);
      S.planoPaciente.forEach(function (p) {
        pc.appendChild(el("div", { cls: "cor-achado", style: "display:block" }, [
          p.texto ? el("div", { text: p.texto }) : null,
          (p.exames || []).length ? el("div", { cls: "cor-sub", text: "📋 Exame pedido: " + p.exames.join(", ") + " (veja em Exames pedidos)" }) : null,
          p.retorno_em ? el("div", { cls: "cor-sub", text: "📅 Retorno sugerido para " + br(p.retorno_em) + " — a clínica marca; aparece na sua Agenda" }) : null
        ]));
      });
      lado.appendChild(pc);
    }
    lado.appendChild(el("div", { cls: "card" }, [el("h6", { text: "Legenda" }), el("div", { cls: "cor-legenda", id: "cor_legenda" })]));
    legenda();
  }

  function linhaTempo() {
    var box = document.getElementById("cor_tempo");
    if (!box) return;
    limpar(box);
    var lt = S.linhaTempo || [];
    if (!S.ia || lt.length < 2) { box.style.display = "none"; return; }
    box.style.display = "";
    box.className = "cor-tempo";
    var idx = -1;
    lt.forEach(function (p, i) { if (S.atual && S.atual.id === p.id) idx = i; });
    var trilho = el("div", { cls: "trilho" });
    trilho.appendChild(el("button", { type: "button", cls: "ponto", text: "◀", title: "Anterior",
      onclick: function () { if (idx > 0) abrirMapa(lt[idx - 1].id); } }));
    lt.forEach(function (p, i) {
      if (i) trilho.appendChild(el("span", { cls: "liga" }));
      trilho.appendChild(el("button", { type: "button", cls: "ponto" + (i === idx ? " on" : ""),
        text: exameNome(p.exame_tipo).split(" ")[0] + " · " + br(p.exame_data), onclick: function () { abrirMapa(p.id); } }));
    });
    trilho.appendChild(el("button", { type: "button", cls: "ponto", text: "▶", title: "Seguinte",
      onclick: function () { if (idx >= 0 && idx < lt.length - 1) abrirMapa(lt[idx + 1].id); } }));
    trilho.appendChild(el("button", { type: "button", cls: "ponto", text: S.tocando ? "⏸ Parar" : "⏯ Evolução",
      title: "Passa pelos exames do mais antigo ao mais novo", onclick: tocar }));
    box.appendChild(el("div", { cls: "cor-sub", text: "📈 Linha do tempo — " + lt.length + " exames" }));
    box.appendChild(trilho);
    if (idx > 0) {
      var mud = lt[idx].mudancas || [];
      box.appendChild(el("div", { cls: "cor-sub", text: mud.length ? "Mudou desde " + br(lt[idx - 1].exame_data) + ":" : "Sem mudança nos achados desde " + br(lt[idx - 1].exame_data) + "." }));
      if (mud.length) box.appendChild(el("ul", {}, mud.map(function (t) { return el("li", { text: t }); })));
    }
  }

  function tocar() {
    if (S.tocando) { clearInterval(S.tocando); S.tocando = null; linhaTempo(); return; }
    if (S.dirty && !window.confirm("Há alterações não salvas. Mostrar a evolução mesmo assim?")) return;
    var lt = S.linhaTempo || [], i = 0;
    S.dirty = false;
    abrirMapa(lt[0].id);
    S.tocando = setInterval(function () {
      i += 1;
      if (i >= lt.length) { clearInterval(S.tocando); S.tocando = null; linhaTempo(); return; }
      abrirMapa(lt[i].id);
    }, 1800);
    linhaTempo();
  }

  function legenda() {
    var l = document.getElementById("cor_legenda");
    if (!l || !S.cat) return;
    limpar(l);
    var g = S.sel ? regiao(S.sel).grupo : (S.pincel ? S.pincel.split("|")[0] : Object.keys(S.cat.grupos)[0]);
    achadosDo(g).forEach(function (a) {
      l.appendChild(el("span", {}, [el("span", { cls: "cor-pinta", style: "background:" + a[2] }), document.createTextNode(a[1])]));
    });
  }

  function sujo(semRedesenho) {
    S.dirty = true;
    aviso("Alterações não salvas.");
    if (!semRedesenho) colorir();
  }

  function definir(id, achadoCod, nota, semPainel) {
    if (!editavel()) return;
    var v = S.atual.regioes[id] || { achado: "", nota: "" };
    if (achadoCod !== null && achadoCod !== undefined) v.achado = achadoCod;
    if (nota !== null && nota !== undefined) v.nota = nota;
    if (!v.achado && !v.nota) delete S.atual.regioes[id]; else S.atual.regioes[id] = v;
    sujo(semPainel);
    if (!semPainel) painel();
  }

  function selecionar(id) {
    S.sel = id;
    colorir();
    painel();
  }

  function novo(copiar) {
    if (S.consulta) return;
    if (S.dirty && !window.confirm("Há alterações não salvas. Começar outro mapa mesmo assim?")) return;
    var base = copiar && S.atual ? JSON.parse(JSON.stringify(S.atual)) : null;
    S.atual = {
      id: null, editavel: true, exame_tipo: base ? base.exame_tipo : ((S.cat.exames || [])[0] || [""])[0], exame_data: hoje(),
      regioes: base ? base.regioes : {}, marcas: base ? base.marcas.map(function (m) { m.id = uid(); return m; }) : [],
      observacoes: base ? base.observacoes : ""
    };
    S.sel = null;
    S.dirty = !!base;
    colorir(); desenharMarcas(); painel();
  }

  function abrirMapa(id) {
    if (S.dirty && !window.confirm("Há alterações não salvas. Abrir outro mapa mesmo assim?")) { painel(); return; }
    var m = S.mapas.filter(function (x) { return x.id === id; })[0];
    S.atual = m ? JSON.parse(JSON.stringify(m)) : null;
    if (S.atual) { S.atual.regioes = S.atual.regioes || {}; S.atual.marcas = S.atual.marcas || []; }
    S.sel = null; S.dirty = false;
    colorir(); desenharMarcas(); painel();
  }

  // A imagem do desenho como está na tela, sobre fundo branco (o canvas é
  // transparente), em JPEG — para o indiDoc
  function capturar() {
    var src = G.renderer && G.renderer.domElement;
    if (!src) return "";
    var cv = document.createElement("canvas"); cv.width = src.width; cv.height = src.height;
    var ctx = cv.getContext("2d"); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(src, 0, 0);
    return cv.toDataURL("image/jpeg", 0.85);
  }

  function salvar() {
    if (!S.atual) return;
    Shiny.setInputValue("coracao_salvar", {
      paciente_id: S.pid, id: S.atual.id || "", t: Date.now(), modelo: S.modelo,
      // 📱 envio ao salvar ligado: a imagem vai junto (o servidor confere a opção)
      imagem: (S.indidocAuto && S.indidocAtivo && !S.atual.inativo_em) ? capturar() : "",
      mapa: { exame_tipo: S.atual.exame_tipo, exame_data: S.atual.exame_data, regioes: S.atual.regioes,
              marcas: S.atual.marcas, observacoes: S.atual.observacoes || "",
              origem: S.atual.origem === "ia" ? "ia" : "manual", fonte_ref: S.atual.fonte_ref || "" }
    }, { priority: "event" });
  }

  // Escore do modelo (ex.: Lund-Mackay): a mesma conta de calcular_escore
  // (mapas_anatomicos.py), refeita a cada pincelada
  function escore() {
    var e = S.cat && S.cat.escore;
    if (!e || !S.atual) return null;
    if (e.tipo === "retinopatia") return retinopatia(e);
    if (e.tipo === "cpod") return cpod(e);
    if (e.tipo === "birads") return birads(e);
    var lados = {}, total = 0, sem = 0;
    Object.keys(e.lados).forEach(function (l) {
      var soma = 0;
      e.lados[l].forEach(function (rid) {
        var v = S.atual.regioes[rid];
        if (!v || !v.achado) { sem += 1; return; }
        soma += e.pontos[v.achado] || 0;
      });
      lados[l] = soma; total += soma;
    });
    return { nome: e.nome, max: e.max, total: total, lados: lados, sem: sem };
  }

  // Retinopatia diabética por olho: a mesma conta de classificar_rd
  // (mapas_anatomicos.py), com a regra que veio do servidor
  var RD = { sem: "sem retinopatia diabética", leve: "não proliferativa leve", moderada: "não proliferativa moderada",
             grave: "não proliferativa grave", proliferativa: "proliferativa" };
  function retinopatia(e) {
    var R = e.regra, partes = [];
    function ach(rid) { var v = S.atual.regioes[rid]; return (v && v.achado) || ""; }
    function tem(lista, a) { return lista.indexOf(a) >= 0; }
    Object.keys(e.olhos).forEach(function (o) {
      var x = e.olhos[o], quad = x.quadrantes.map(ach);
      var todos = quad.concat(x.outras.map(ach)).filter(function (a) { return a; });
      var mac = ach(x.macula), edema = mac ? tem(R.edema, mac) : null, classe = "";
      if (todos.length) {
        if (todos.some(function (a) { return tem(R.proliferativa, a); })) classe = "proliferativa";
        else if (Object.keys(R.grave).some(function (a) { return quad.filter(function (q) { return q === a; }).length >= R.grave[a]; })) classe = "grave";
        else if (todos.some(function (a) { return tem(R.moderada, a); })) classe = "moderada";
        else if (todos.some(function (a) { return tem(R.leve, a); })) classe = "leve";
        else classe = "sem";
      }
      if (!classe && edema === null) return;
      partes.push(o + " " + (classe ? RD[classe] : "sem marcação")
        + (edema === null ? "" : edema ? ", com edema macular" : ", sem edema macular"));
    });
    return { texto: e.nome + ": " + (partes.length ? partes.join(" · ") : "marque a retina para classificar") };
  }

  // CPO-D / ceo-d: a mesma conta de contar_cpod (mapas_anatomicos.py)
  var FACES = ["m", "d", "o", "v", "l"];
  function contarCpod(dentes, R, dec) {
    function ach(rid) { var v = S.atual.regioes[rid]; return (v && v.achado) || ""; }
    function tem(lista, a) { return lista.indexOf(a) >= 0; }
    var r = { c: 0, p: 0, o: 0, marcados: 0 }, perdido = dec ? R.extracao : R.perdido;
    dentes.forEach(function (d) {
      var dente = ach(d), faces = FACES.map(function (f) { return ach(d + "_" + f); });
      if (dente || faces.some(function (f) { return f; })) r.marcados += 1;
      if (tem(perdido, dente)) r.p += 1;
      else if (faces.some(function (f) { return tem(R.cariado, f); })) r.c += 1;
      else if (tem(R.obturado_dente, dente) || faces.some(function (f) { return tem(R.obturado_face, f); })) r.o += 1;
    });
    r.total = r.c + r.p + r.o;
    return r;
  }
  function cpod(e) {
    var pe = contarCpod(e.permanentes, e.regra, false), de = contarCpod(e.deciduos, e.regra, true), partes = [];
    if (pe.marcados) partes.push("CPO-D " + pe.total + " (C " + pe.c + ", P " + pe.p + ", O " + pe.o + ")");
    if (de.marcados) partes.push("ceo-d " + de.total + " (c " + de.c + ", e " + de.p + ", o " + de.o + ")");
    return { texto: partes.length ? partes.join(" · ") : "CPO-D: marque os dentes para contar" };
  }

  // BI-RADS por mama: a mesma conta de classificar_birads (mapas_anatomicos.py)
  function birads(e) {
    var R = e.regra, partes = [];
    Object.keys(e.mamas).forEach(function (m) {
      var cats = e.mamas[m].map(function (rid) { var v = S.atual.regioes[rid]; return v && R.categorias[v.achado]; })
        .filter(function (c) { return c && R.ordem.indexOf(c) >= 0; });
      if (!cats.length) return;
      partes.push(m + " " + cats.reduce(function (a, b) { return R.ordem.indexOf(b) > R.ordem.indexOf(a) ? b : a; }));
    });
    return { texto: partes.length ? e.nome + ": " + partes.join(" · ") : e.nome + ": marque os achados para classificar" };
  }

  function trocarModelo(id) {
    if (id === S.modelo) return;
    if (S.dirty && !window.confirm("Há alterações não salvas. Trocar de mapa mesmo assim?")) return;
    S.dirty = false;
    Shiny.setInputValue("coracao_abrir", { t: Date.now(), modelo: id }, { priority: "event" });
  }

  function uid() { return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ── three.js: a cena ──────────────────────────────────────────────────
  function carregarThree(url, cb) {
    if (window.THREE) return cb();
    if (S.carregando) { S.carregando.push(cb); return; }
    S.carregando = [cb];
    var s = document.createElement("script");
    s.src = url;
    s.onload = function () { var l = S.carregando; S.carregando = null; l.forEach(function (f) { f(); }); };
    s.onerror = function () { S.carregando = null; aviso("Não foi possível carregar o desenho 3D (atualize a página)."); };
    document.head.appendChild(s);
  }

  function corBase(grupo) { return ((S.cat && S.cat.cores_base) || {})[grupo] || "#cbd5e1"; }

  function cena() {
    if (G.renderer) return;
    var T = window.THREE, palco = document.getElementById("cor_palco");
    var w = palco.clientWidth || 600, h = palco.clientHeight || 520;
    G.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    G.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    G.renderer.setSize(w, h);
    palco.appendChild(G.renderer.domElement);
    G.scene = new T.Scene();
    G.camera = new T.PerspectiveCamera(35, w / h, 0.1, 100);
    G.camera.position.set(0, 0.1, 7.2);
    G.scene.add(new T.HemisphereLight(0xffffff, 0x8899aa, 0.85));
    var dl = new T.DirectionalLight(0xffffff, 0.75); dl.position.set(3, 4, 5); G.scene.add(dl);
    var dl2 = new T.DirectionalLight(0xffffff, 0.35); dl2.position.set(-4, -2, -3); G.scene.add(dl2);
    // coracao: o giro do médico; corpo: a inclinação anatômica fixa (o ápice
    // para a esquerda do paciente = direita da tela na vista de frente)
    G.coracao = new T.Group();
    G.scene.add(G.coracao);
    G.corpo = new T.Group();
    G.coracao.add(G.corpo);
    G.malhas = [];   // {mesh, id, grupo}
    montarModelo(S.modelo);
    interacao(T, palco);
    if (window.ResizeObserver) new ResizeObserver(function () { redimensionar(); }).observe(palco);
    (function loop() { requestAnimationFrame(loop); G.renderer.render(G.scene, G.camera); })();
  }

  function redimensionar() {
    var palco = document.getElementById("cor_palco");
    if (!palco || !G.renderer) return;
    var w = palco.clientWidth, h = palco.clientHeight;
    if (!w || !h) return;
    G.renderer.setSize(w, h);
    G.camera.aspect = w / h;
    G.camera.updateProjectionMatrix();
  }

  // Ventrículo esquerdo: elipsoide, eixo longo vertical (ápice embaixo).
  // eta: 0 no ápice → 100° na base; phi: 90 anterior (frente), 180 septo
  // (lado do VD, à esquerda da tela), 270 inferior (atrás), 0 lateral.
  var A = 0.78, L = 1.3;
  function pontoVE(eta, phi, k) {
    k = k || 1;
    var e = eta * Math.PI / 180, p = phi * Math.PI / 180, r = A * Math.sin(e) * k;
    return [r * Math.cos(p), -L * Math.cos(e) * k + (k - 1) * 0.0, r * Math.sin(p)];
  }

  function superficie(T, f, u0, u1, v0, v1, nu, nv) {
    var pos = [], idx = [];
    for (var j = 0; j <= nv; j++) {
      for (var i = 0; i <= nu; i++) {
        var p = f(u0 + (u1 - u0) * i / nu, v0 + (v1 - v0) * j / nv);
        pos.push(p[0], p[1], p[2]);
      }
    }
    for (j = 0; j < nv; j++) {
      for (i = 0; i < nu; i++) {
        var a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    var g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function material(T, grupo, transp) {
    return new T.MeshStandardMaterial({ color: corBase(grupo), roughness: 0.55, metalness: 0.05,
      side: T.DoubleSide, transparent: !!transp, opacity: transp ? 0.42 : 1, depthWrite: !transp });
  }

  function add(T, geo, id, grupo, transp) {
    var m = new T.Mesh(geo, material(T, grupo, transp));
    m.userData = { id: id, grupo: grupo, transp: !!transp };
    G.corpo.add(m);
    G.malhas.push(m);
    return m;
  }

  function contorno(T, pts) {
    var g = new T.BufferGeometry().setFromPoints(pts.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); }));
    var l = new T.Line(g, new T.LineBasicMaterial({ color: 0x7f1d1d, transparent: true, opacity: 0.55 }));
    G.corpo.add(l);
  }

  function segmento(T, id, eta0, eta1, phi0, phi1) {
    var gap = 0.7;
    var geo = superficie(T, function (phi, eta) { return pontoVE(eta, phi); },
      phi0 + gap, phi1 - gap, Math.max(eta0, 0.01) + (eta0 > 0 ? gap : 0), eta1 - gap, 18, 8);
    add(T, geo, id, "parede");
    var pts = [], k = 1.004, n = 24, i;
    for (i = 0; i <= n; i++) pts.push(pontoVE(eta1, phi0 + (phi1 - phi0) * i / n, k));
    if (eta0 > 0) for (i = n; i >= 0; i--) pts.push(pontoVE(eta0, phi0 + (phi1 - phi0) * i / n, k));
    contorno(T, pts);
  }

  function tubo(T, pts, raio, id, grupo, transp) {
    var curva = new T.CatmullRomCurve3(pts.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); }));
    return add(T, new T.TubeGeometry(curva, 64, raio, 12, false), id, grupo, transp);
  }

  function anel(T, pos, raio, rot, id) {
    var m = add(T, new T.TorusGeometry(raio, 0.045, 12, 40), id, "valva");
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.set(rot[0], rot[1], rot[2]);
    return m;
  }

  function construirCoracao(T) {
    // 17 segmentos (AHA): basal 80–100°, médio 55–80°, apical 20–55°, ápice 0–20°
    var centros = [90, 150, 210, 270, 330, 30];
    for (var i = 0; i < 6; i++) {
      segmento(T, "s" + (i + 1), 80, 100, centros[i] - 30, centros[i] + 30);
      segmento(T, "s" + (i + 7), 55, 80, centros[i] - 30, centros[i] + 30);
    }
    [[13, 90], [14, 180], [15, 270], [16, 0]].forEach(function (s) { segmento(T, "s" + s[0], 20, 55, s[1] - 45, s[1] + 45); });
    segmento(T, "s17", 0, 20, 0, 360);

    // Câmaras (semitransparentes: o septo continua visível e clicável)
    G.camaras = [];
    var vd = superficie(T, function (phi, eta) {
      var p = pontoVE(eta, phi, 1.55);
      return [p[0] - 0.12, p[1] * 0.92 + 0.08, p[2] + 0.05];
    }, 105, 255, 32, 100, 28, 12);
    G.camaras.push(add(T, vd, "vd", "camara", true));
    var ae = add(T, new T.SphereGeometry(0.44, 28, 18), "ae", "camara", true); ae.position.set(0.32, 0.72, -0.42);
    var ad = add(T, new T.SphereGeometry(0.47, 28, 18), "ad", "camara", true); ad.position.set(-0.86, 0.6, -0.02);
    G.camaras.push(ae, ad);
    G.camaras.push(tubo(T, [[-0.12, 0.3, 0.12], [-0.18, 0.9, 0.18], [-0.08, 1.55, 0.05], [0.35, 1.8, -0.25],
      [0.65, 1.5, -0.55], [0.7, 0.8, -0.7]], 0.17, "aorta", "camara", true));
    G.camaras.push(tubo(T, [[-0.34, 0.42, 0.62], [-0.15, 0.95, 0.66], [0.2, 1.28, 0.42], [0.42, 1.38, 0.1]],
      0.15, "tp", "camara", true));
    G.camaras.forEach(function (m) { m.renderOrder = 2; });

    // Valvas
    anel(T, [0.22, 0.24, -0.06], 0.3, [Math.PI / 2, 0, 0], "mitral");
    anel(T, [-0.12, 0.33, 0.12], 0.18, [Math.PI / 2, 0, 0.2], "aortica");
    anel(T, [-0.82, 0.25, 0.12], 0.27, [Math.PI / 2, 0, -0.2], "tricuspide");
    anel(T, [-0.33, 0.47, 0.62], 0.15, [Math.PI / 2.4, 0, 0], "pulmonar");

    // Coronárias (coladas à superfície)
    var DA = [], CX = [], CD = [], j;
    for (j = 0; j <= 12; j++) DA.push(pontoVE(98 - j * 7.5, 128 - j * 1.5, 1.035));
    for (j = 0; j <= 14; j++) CX.push(pontoVE(96, 122 - j * 12, 1.035));
    for (j = 0; j <= 8; j++) { var p = pontoVE(96, 140 + j * 12, 1.62); CD.push([p[0] - 0.12, p[1] * 0.92 + 0.08, p[2] + 0.05]); }
    for (j = 1; j <= 7; j++) { var q = pontoVE(96 - j * 9, 236, 1.6); CD.push([q[0] - 0.12, q[1] * 0.92 + 0.08, q[2] + 0.05]); }
    tubo(T, [[-0.05, 0.36, 0.26], [0.0, 0.3, 0.45], pontoVE(98, 126, 1.035)], 0.04, "tce", "coronaria");
    tubo(T, DA, 0.034, "da", "coronaria");
    tubo(T, CX, 0.032, "cx", "coronaria");
    tubo(T, [[-0.2, 0.36, 0.22]].concat(CD), 0.034, "cd", "coronaria");
  }

  // ── 👃 Nariz e seios da face ──────────────────────────────────────────
  // Vista de frente: o lado DIREITO do paciente fica à ESQUERDA da tela
  // (x < 0), como na radiologia. Contorno do crânio e órbitas só de
  // referência (não clicáveis); o contorno some com "◐ Contorno".
  function bolha(T, id, grupo, pos, esc, transp) {
    var m = add(T, new T.SphereGeometry(1, 28, 20), id, grupo, transp);
    m.position.set(pos[0], pos[1], pos[2]);
    m.scale.set(esc[0], esc[1], esc[2]);
    return m;
  }
  function caixa(T, id, grupo, pos, tam) {
    var m = add(T, new T.BoxGeometry(tam[0], tam[1], tam[2], 2, 2, 2), id, grupo);
    m.position.set(pos[0], pos[1], pos[2]);
    return m;
  }
  function bastao(T, id, grupo, pos, comp, raio) {
    var m = add(T, new T.CapsuleGeometry(raio, comp, 6, 14), id, grupo);
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.x = Math.PI / 2;     // ao longo da fossa nasal (frente-trás)
    return m;
  }
  function construirSeios(T) {
    G.camaras = [];
    var cranio = new T.Mesh(new T.SphereGeometry(1, 36, 24), new T.MeshStandardMaterial({
      color: 0xe7d3c2, transparent: true, opacity: 0.12, depthWrite: false, side: T.DoubleSide }));
    cranio.scale.set(1.55, 1.95, 1.75); cranio.position.set(0, 0.35, -0.35);
    G.corpo.add(cranio); G.camaras.push(cranio);
    [-1, 1].forEach(function (lado) {
      var orb = new T.Mesh(new T.TorusGeometry(0.36, 0.035, 10, 40), new T.MeshStandardMaterial({ color: 0x94a3b8 }));
      orb.position.set(lado * 0.66, 0.62, 0.95);
      G.corpo.add(orb); G.camaras.push(orb);
    });
    // _d (direito do paciente) à esquerda da tela
    [["d", -1], ["e", 1]].forEach(function (p) {
      var l = p[0], x = p[1];
      bolha(T, "front_" + l, "seio", [x * 0.33, 1.28, 0.78], [0.3, 0.26, 0.17]);
      bolha(T, "max_" + l, "seio", [x * 0.74, -0.1, 0.38], [0.42, 0.42, 0.55]);
      caixa(T, "etm_ant_" + l, "seio", [x * 0.22, 0.58, 0.55], [0.2, 0.42, 0.38]);
      caixa(T, "etm_post_" + l, "seio", [x * 0.22, 0.58, 0.1], [0.2, 0.42, 0.44]);
      caixa(T, "esf_" + l, "seio", [x * 0.19, 0.48, -0.42], [0.34, 0.42, 0.42]);
      bolha(T, "com_" + l, "com", [x * 0.4, 0.22, 0.48], [0.1, 0.1, 0.1]);
      bastao(T, "cor_inf_" + l, "nasal", [x * 0.36, -0.36, 0.22], 1.0, 0.1);
      bastao(T, "cor_med_" + l, "nasal", [x * 0.32, 0.04, 0.28], 0.72, 0.075);
    });
    caixa(T, "septo_ant", "nasal", [0, -0.08, 0.62], [0.035, 0.85, 0.66]);
    caixa(T, "septo_post", "nasal", [0, -0.08, -0.02], [0.035, 0.85, 0.62]);
    bolha(T, "adenoide", "nasal", [0, 0.0, -0.75], [0.26, 0.22, 0.2]);
  }

  // ── 👂 Ouvido: as duas membranas timpânicas em 2D (otoscopia) ─────────
  // Orelha direita à esquerda da tela; o lado ANTERIOR de cada membrana fica
  // para o meio (o triângulo luminoso no quadrante anteroinferior). Cabo do
  // martelo e triângulo luminoso só de referência ("◐ Referências").
  function setor(T, id, grupo, cx, r0, r1, a0, a1, z) {
    var g = r0 > 0 ? new T.RingGeometry(r0, r1, 40, 1, a0, a1 - a0) : new T.CircleGeometry(r1, 40, a0, a1 - a0);
    var m = add(T, g, id, grupo);
    m.position.set(cx, 0, z || 0);
    return m;
  }
  function referencia(T, geo, pos, cor, rotZ, opac) {
    var m = new T.Mesh(geo, new T.MeshStandardMaterial({ color: cor, side: T.DoubleSide,
      transparent: !!opac, opacity: opac || 1, depthWrite: !opac }));
    m.position.set(pos[0], pos[1], pos[2]);
    if (rotZ) m.rotation.z = rotZ;
    G.corpo.add(m); G.camaras.push(m);
    return m;
  }
  function construirOuvido(T) {
    G.camaras = [];
    var R = 0.7, G4 = 0.025, Q = Math.PI / 2;
    // [lado, centro x, anterior (+1 = para a direita da tela)]
    [["d", -1.15, 1], ["e", 1.15, -1]].forEach(function (p) {
      var l = p[0], cx = p[1], ant = p[2];
      setor(T, "conduto_" + l, "conduto", cx, R + 0.05, R + 0.25, 0, 2 * Math.PI, -0.01);
      // quadrantes pelo umbo (ângulo a partir de +x, anti-horário)
      var q = ant > 0 ? { as: 0, ps: 1, pi: 2, ai: 3 } : { ps: 0, as: 1, ai: 2, pi: 3 };
      Object.keys(q).forEach(function (k) {
        setor(T, "mt_" + k + "_" + l, "membrana", cx, 0, R, q[k] * Q + G4, (q[k] + 1) * Q - G4, 0);
      });
      setor(T, "mt_flac_" + l, "membrana", cx, R * 0.62, R, Q - 0.42, Q + 0.42, 0.02);
      bolha(T, "media_" + l, "media", [cx - ant * 0.85, 0.92, -0.05], [0.24, 0.24, 0.08]);
      // cabo do martelo (do umbo para cima e para a frente) e triângulo luminoso
      var cabo = referencia(T, new T.BoxGeometry(0.045, R * 0.66, 0.01), [cx + ant * 0.05, R * 0.33, 0.04], 0xa16207,
                            -ant * 0.15);
      cabo.renderOrder = 3;
      var tri = new T.Shape();
      tri.moveTo(0, 0); tri.lineTo(ant * R * 0.62, -R * 0.4); tri.lineTo(ant * R * 0.48, -R * 0.55); tri.lineTo(0, 0);
      referencia(T, new T.ShapeGeometry(tri), [cx + ant * 0.06, -0.06, 0.035], 0xffffff, 0, 0.45);
    });
  }

  // ── 🗣️ Laringe: vista de cima (laringoscopia) ─────────────────────────
  // Comissura anterior em cima; lado direito do paciente à esquerda da tela.
  function entre(T, id, grupo, a, b, raio) {
    var va = new T.Vector3(a[0], a[1], a[2]), vb = new T.Vector3(b[0], b[1], b[2]);
    var dir = vb.clone().sub(va), comp = dir.length();
    var m = add(T, new T.CapsuleGeometry(raio, Math.max(comp - 2 * raio, 0.01), 6, 14), id, grupo);
    m.position.copy(va.clone().add(vb).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
    return m;
  }
  function construirLaringe(T) {
    G.camaras = [];
    var parede = referencia(T, new T.TorusGeometry(1.45, 0.035, 10, 60), [0, 0.1, -0.2], 0xd4a5a5);
    parede.scale.set(1, 1.05, 1);
    var ep = add(T, new T.TorusGeometry(0.72, 0.11, 12, 48, Math.PI), "epiglote", "supraglote");
    ep.position.set(0, 0.4, 0.12);
    bolha(T, "valeculas", "hipofaringe", [0, 1.3, -0.05], [0.5, 0.12, 0.08]);
    bolha(T, "comissura_ant", "glote", [0, 0.56, 0.02], [0.07, 0.07, 0.07]);
    bolha(T, "comissura_post", "glote", [0, -0.8, 0.02], [0.16, 0.1, 0.1]);
    bolha(T, "subglote", "subglote", [0, -0.1, -0.35], [0.26, 0.5, 0.04]);
    [["d", -1], ["e", 1]].forEach(function (p) {
      var l = p[0], x = p[1];
      entre(T, "vocal_" + l, "glote", [x * 0.03, 0.52, 0], [x * 0.3, -0.58, 0], 0.07);
      entre(T, "vestibular_" + l, "supraglote", [x * 0.17, 0.6, 0.1], [x * 0.6, -0.42, 0.1], 0.09);
      bolha(T, "aritenoide_" + l, "supraglote", [x * 0.33, -0.72, 0.06], [0.17, 0.2, 0.17]);
      bolha(T, "piriforme_" + l, "hipofaringe", [x * 0.98, -0.5, -0.1], [0.2, 0.4, 0.12]);
    });
  }

  // ── 👁️ Segmento anterior: os dois olhos de frente ────────────────────
  // Olho direito à esquerda da tela. A córnea e a câmara anterior ficam na
  // frente (semitransparentes; o clique pega a mais próxima); "◐ Camadas"
  // tira a córnea e depois a câmara para chegar à íris e ao cristalino.
  function vidro(m, opac) {
    m.material.transparent = true; m.material.opacity = opac; m.material.depthWrite = false;
    m.renderOrder = 2;
    return m;
  }
  function construirOlho(T) {
    G.camaras = [];
    var corneas = [], camaras = [];
    [["d", -1.15], ["e", 1.15]].forEach(function (p) {
      var l = p[0], cx = p[1];
      var esc = add(T, new T.RingGeometry(0.5, 0.95, 48, 1), "conjuntiva_" + l, "conjuntiva");
      esc.position.set(cx, 0, 0); esc.scale.set(1, 0.62, 1);
      var ps = add(T, new T.TorusGeometry(0.95, 0.1, 10, 40, Math.PI), "palp_sup_" + l, "palpebra");
      ps.position.set(cx, 0.02, 0.03); ps.scale.set(1, 0.68, 1);
      var pi = add(T, new T.TorusGeometry(0.95, 0.08, 10, 40, Math.PI), "palp_inf_" + l, "palpebra");
      pi.position.set(cx, -0.02, 0.03); pi.scale.set(1, 0.6, 1); pi.rotation.z = Math.PI;
      var cr = add(T, new T.CircleGeometry(0.17, 32), "cristalino_" + l, "cristalino");
      cr.position.set(cx, 0, 0.01);
      var ir = add(T, new T.RingGeometry(0.17, 0.46, 48, 1), "iris_" + l, "iris");
      ir.position.set(cx, 0, 0.02);
      var ca = vidro(add(T, new T.CircleGeometry(0.47, 40), "camara_" + l, "camara"), 0.3);
      ca.position.set(cx, 0, 0.06);
      var R = 0.62, th = 0.9;
      var co = vidro(add(T, new T.SphereGeometry(R, 32, 12, 0, 2 * Math.PI, 0, th), "cornea_" + l, "cornea"), 0.28);
      co.rotation.x = Math.PI / 2; co.position.set(cx, 0, 0.08 - R * Math.cos(th));
      corneas.push(co); camaras.push(ca);
    });
    G.camadas = [corneas, camaras];
  }

  // ── 🔴 Fundo de olho em 2D (retinografia) ────────────────────────────
  // Olho direito à esquerda; o disco óptico do lado NASAL (para o meio da
  // tela) e a mácula do temporal. Vasos e fóvea só de referência ("◐ Vasos").
  function construirFundo(T) {
    G.camaras = [];
    var R = 0.85, Q = Math.PI / 2, g = 0.02;
    // [lado, centro x, nasal (+1 = para a direita da tela)]
    [["d", -1.15, 1], ["e", 1.15, -1]].forEach(function (p) {
      var l = p[0], cx = p[1], n = p[2];
      setor(T, "vitreo_" + l, "vitreo", cx, R + 0.04, R + 0.17, 0, 2 * Math.PI, -0.01);
      var q = n > 0 ? { sn: 0, st: 1, it: 2, "in": 3 } : { st: 0, sn: 1, "in": 2, it: 3 };
      Object.keys(q).forEach(function (k) {
        setor(T, "ret_" + k + "_" + l, "retina", cx, 0, R, q[k] * Q + g, (q[k] + 1) * Q - g, 0);
      });
      var mac = add(T, new T.CircleGeometry(0.18, 32), "macula_" + l, "macula");
      mac.position.set(cx - n * 0.3, -0.02, 0.02);
      var dis = add(T, new T.CircleGeometry(0.12, 32), "disco_" + l, "disco");
      dis.position.set(cx + n * 0.34, 0.02, 0.03);
      referencia(T, new T.CircleGeometry(0.035, 16), [cx - n * 0.3, -0.02, 0.035], 0x7c2d12);
      [1, -1].forEach(function (s) {
        var pts = [[cx + n * 0.34, s * 0.06, 0.04], [cx + n * 0.12, s * 0.32, 0.04], [cx - n * 0.25, s * 0.42, 0.04],
                   [cx - n * 0.62, s * 0.36, 0.04], [cx - n * 0.78, s * 0.2, 0.04]];
        var curva = new T.CatmullRomCurve3(pts.map(function (v) { return new T.Vector3(v[0], v[1], v[2]); }));
        referencia(T, new T.TubeGeometry(curva, 40, 0.018, 8, false), [0, 0, 0], 0x7f1d1d);
        var nas = new T.CatmullRomCurve3([[cx + n * 0.36, s * 0.06, 0.04], [cx + n * 0.58, s * 0.3, 0.04],
          [cx + n * 0.72, s * 0.42, 0.04]].map(function (v) { return new T.Vector3(v[0], v[1], v[2]); }));
        referencia(T, new T.TubeGeometry(nas, 20, 0.013, 8, false), [0, 0, 0], 0x7f1d1d);
      });
    });
  }

  // ── 🎀 Mamas em 2D, de frente (25/10/2026) ───────────────────────────
  // A mama DIREITA à esquerda da tela. Cada uma: os 4 quadrantes, a região
  // retroareolar e o complexo areolopapilar no centro, o prolongamento axilar
  // e a axila (para cima e para fora). "◐ Relógio" mostra/esconde as horas.
  function textoSprite(T, txt, x, y, tam, cor) {
    var cv = document.createElement("canvas"); cv.width = 512; cv.height = 64;
    var ctx = cv.getContext("2d");
    ctx.fillStyle = cor; ctx.font = "bold 40px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, 256, 34);
    var sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), depthTest: false }));
    sp.scale.set(tam * 8, tam, 1);
    sp.position.set(x, y, 0.05);
    G.corpo.add(sp);
    return sp;
  }
  function construirMama(T) {
    G.camaras = [];
    var R = 0.95, Q = Math.PI / 2, g = 0.015;
    // [lado, centro x, lado lateral (-1 = para a esquerda da tela), rótulo]
    [["d", -1.3, -1, "Mama direita"], ["e", 1.3, 1, "Mama esquerda"]].forEach(function (p) {
      var l = p[0], cx = p[1], lat = p[2];
      var q = lat < 0 ? { qsm: 0, qsl: 1, qil: 2, qim: 3 } : { qsl: 0, qsm: 1, qim: 2, qil: 3 };
      Object.keys(q).forEach(function (k) {
        setor(T, k + "_" + l, "parenquima", cx, 0.3, R, q[k] * Q + g, (q[k] + 1) * Q - g, 0);
      });
      setor(T, "retro_" + l, "parenquima", cx, 0.135, 0.285, 0, 2 * Math.PI, 0.01);
      var cap = add(T, new T.CircleGeometry(0.12, 32), "cap_" + l, "cap");
      cap.position.set(cx, 0, 0.02);
      // prolongamento axilar e axila: na diagonal superolateral
      var ang = lat < 0 ? 3 * Math.PI / 4 : Math.PI / 4;
      var pro = add(T, new T.CircleGeometry(0.2, 32), "prolong_" + l, "parenquima");
      pro.scale.set(1.7, 0.75, 1); pro.rotation.z = ang;
      pro.position.set(cx + Math.cos(ang) * 1.13, Math.sin(ang) * 1.13, 0);
      var ax = add(T, new T.CircleGeometry(0.24, 32), "axila_" + l, "axila");
      ax.position.set(cx + Math.cos(ang) * 1.68, Math.sin(ang) * 1.68, 0);
      var pts = [];
      for (var i = 0; i <= 64; i++) pts.push([cx + Math.cos(i / 64 * 2 * Math.PI) * (R + 0.02),
                                              Math.sin(i / 64 * 2 * Math.PI) * (R + 0.02), 0.03]);
      contorno(T, pts);
      textoSprite(T, p[3], cx, -R - 0.36, 0.2, "#475569");
      // as horas do relógio, como vistas de frente
      [["12", 0, 1], ["3", 1, 0], ["6", 0, -1], ["9", -1, 0]].forEach(function (h) {
        G.camaras.push(textoSprite(T, h[0], cx + h[1] * (R + 0.16), h[2] * (R + 0.14), 0.17, "#64748b"));
      });
    });
  }

  // ── 🦷 Odontograma (FDI) em 2D ────────────────────────────────────────
  // Lado direito do paciente à esquerda da tela; superiores em cima (a
  // vestibular para fora), decíduos nas fileiras de dentro. Cada dente: as
  // 5 faces (a oclusal/incisal no centro; a mesial para o meio da boca) e,
  // do lado de fora, a faixa do dente inteiro. "◐ Decíduos" os esconde.
  function construirOdonto(T) {
    G.camaras = [];
    var W = 0.31, S2 = 0.125, I = S2 * 0.45, GAP = 0.05;
    function forma(T, pts, id, grupo, cx, cy) {
      var sh = new T.Shape();
      sh.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
      sh.lineTo(pts[0][0], pts[0][1]);
      var m = add(T, new T.ShapeGeometry(sh), id, grupo);
      m.position.set(cx, cy, 0);
      return m;
    }
    function linhas(T, segs, cx, cy) {
      var pos = [];
      segs.forEach(function (s) { pos.push(s[0], s[1], 0.02, s[2], s[3], 0.02); });
      var g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      var l = new T.LineSegments(g, new T.LineBasicMaterial({ color: 0x64748b }));
      l.position.set(cx, cy, 0);
      G.corpo.add(l);
      return l;
    }
    function numero(T, txt, x, y, dec) {
      var cv = document.createElement("canvas"); cv.width = 64; cv.height = 32;
      var ctx = cv.getContext("2d");
      ctx.fillStyle = dec ? "#64748b" : "#1f2937"; ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, 32, 17);
      var sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), depthTest: false }));
      sp.scale.set(0.26, 0.13, 1); sp.position.set(x, y, 0.05);
      G.corpo.add(sp);
      return sp;
    }
    // Modo paciente (indiDoc): o desenho do dente (coroa e raiz) por fora do
    // número, como na ficha de papel — quem não é dentista reconhece o dente
    // pelo desenho, não pelo quadrado. Pinta com o achado do dente inteiro.
    // Pontos: x, e t = distância da borda incisal/oclusal para a raiz.
    var SILHUETAS = {
      incisivo: [[-0.10, 0], [0.10, 0], [0.075, 0.17], [0.02, 0.45], [0, 0.47], [-0.02, 0.45], [-0.075, 0.17]],
      canino: [[-0.10, 0.06], [0, 0], [0.10, 0.06], [0.08, 0.19], [0.025, 0.53], [0, 0.55], [-0.025, 0.53], [-0.08, 0.19]],
      premolar: [[-0.11, 0.03], [-0.06, 0], [0, 0.03], [0.06, 0], [0.11, 0.03], [0.09, 0.17], [0.03, 0.44], [0, 0.46],
                 [-0.03, 0.44], [-0.09, 0.17]],
      molar: [[-0.13, 0.03], [-0.09, 0], [-0.045, 0.025], [0, 0], [0.045, 0.025], [0.09, 0], [0.13, 0.03], [0.12, 0.17],
              [0.10, 0.38], [0.075, 0.40], [0.045, 0.20], [0, 0.19], [-0.045, 0.20], [-0.075, 0.40], [-0.10, 0.38],
              [-0.12, 0.17]]
    };
    function silhueta(T, k, id, cx, y0, fora) {
      var tipo = k <= 2 ? "incisivo" : k === 3 ? "canino" : k <= 5 ? "premolar" : "molar";
      var esc = k === 2 ? 0.85 : k === 7 ? 0.92 : k === 8 ? 0.85 : 1;
      var pts = SILHUETAS[tipo].map(function (p) { return [p[0] * esc, fora * p[1]]; });
      var m = forma(T, pts, id, "dente", cx, y0);
      var segs = pts.map(function (p, i) { var q = pts[(i + 1) % pts.length]; return [p[0], p[1], q[0], q[1]]; });
      var c = fora * 0.17;                    // a linha do colo: coroa | raiz
      segs.push([-0.085 * esc, c, 0.085 * esc, c]);
      return [m, linhas(T, segs, cx, y0)];
    }
    // [quadrante, superior?, lado na tela (-1 = esquerda), decíduo?, y]
    [[1, true, -1, false, 1.15], [2, true, 1, false, 1.15], [4, false, -1, false, -1.15], [3, false, 1, false, -1.15],
     [5, true, -1, true, 0.42], [6, true, 1, true, 0.42], [8, false, -1, true, -0.42], [7, false, 1, true, -0.42]]
      .forEach(function (q) {
        var quad = q[0], sup = q[1], lado = q[2], dec = q[3], cy = q[4], n = dec ? 5 : 8;
        for (var k = 1; k <= n; k++) {
          var num = quad * 10 + k, id = "d" + num, cx = lado * ((k - 0.5) * W + GAP);
          var fora = sup ? 1 : -1;               // vestibular: para fora da boca
          var mesD = lado < 0 ? 1 : -1;          // mesial: para o meio da tela
          var faces = {
            o: [[-I, -I], [I, -I], [I, I], [-I, I]],
            v: [[-S2, fora * S2], [S2, fora * S2], [I, fora * I], [-I, fora * I]],
            l: [[-S2, -fora * S2], [-I, -fora * I], [I, -fora * I], [S2, -fora * S2]],
            m: [[mesD * S2, -S2], [mesD * I, -I], [mesD * I, I], [mesD * S2, S2]],
            d: [[-mesD * S2, -S2], [-mesD * S2, S2], [-mesD * I, I], [-mesD * I, -I]]
          };
          var malhas = [];
          Object.keys(faces).forEach(function (f) {
            malhas.push(forma(T, faces[f].map(function (p) { return [p[0] * 0.97, p[1] * 0.97]; }),
                              id + "_" + f, "face", cx, cy));
          });
          // contorno: quadrado de fora, quadrado de dentro e as diagonais
          malhas.push(linhas(T, [[-S2, -S2, S2, -S2], [S2, -S2, S2, S2], [S2, S2, -S2, S2], [-S2, S2, -S2, -S2],
                                 [-I, -I, I, -I], [I, -I, I, I], [I, I, -I, I], [-I, I, -I, -I],
                                 [-S2, -S2, -I, -I], [S2, -S2, I, -I], [S2, S2, I, I], [-S2, S2, -I, I]], cx, cy));
          var yb = cy + fora * (S2 + 0.07), hb = 0.04;
          malhas.push(forma(T, [[-S2, -hb], [S2, -hb], [S2, hb], [-S2, hb]], id, "dente", cx, yb));
          malhas.push(linhas(T, [[-S2, -hb, S2, -hb], [S2, -hb, S2, hb], [S2, hb, -S2, hb], [-S2, hb, -S2, -hb]], cx, yb));
          malhas.push(numero(T, String(num), cx, cy + fora * (S2 + 0.2), dec));
          if (S.paciente && !dec) malhas.push.apply(malhas, silhueta(T, k, id, cx, cy + fora * (S2 + 0.29), fora));
          if (dec) G.camaras.push.apply(G.camaras, malhas);
        }
      });
    // linhas da arcada (meio da boca e entre superiores e inferiores)
    // (ficam sempre: o ◐ esconde só os decíduos)
    var meio = referencia(T, new T.PlaneGeometry(0.012, 3.3), [0, 0, -0.01], 0x94a3b8);
    var arcada = referencia(T, new T.PlaneGeometry(5.4, 0.012), [0, 0, -0.01], 0x94a3b8);
    G.camaras = G.camaras.filter(function (m) { return m !== meio && m !== arcada; });
  }

  // Registro dos modelos: forma, inclinação fixa, vistas e o botão ◐
  var MODELOS = {
    coracao: { construir: construirCoracao, incl: 0.5, y: -0.2,
      vistas: [["frente", "Frente", [0.1, -0.3, 0]], ["costas", "Costas", [0.1, Math.PI - 0.3, 0]],
               ["base", "Base", [-1.3, -0.3, 0]], ["lado", "Lado", [0.1, -1.65, 0]]],
      alternar: ["◐ Câmaras", "VD, átrios e vasos: mostrar/esconder"] },
    seios: { construir: construirSeios, incl: 0, y: -0.35,
      vistas: [["frente", "Frente", [0.05, 0, 0]], ["obliqua", "Oblíqua", [0.15, -0.65, 0]],
               ["lado", "Lado", [0.05, -1.57, 0]], ["cima", "De cima", [1.25, 0, 0]]],
      alternar: ["◐ Contorno", "Crânio e órbitas: mostrar/esconder"] },
    ouvido: { construir: construirOuvido, incl: 0, y: 0,
      vistas: [["frente", "Otoscopia", [0, 0, 0]], ["obliqua", "Oblíqua", [0.35, -0.45, 0]]],
      alternar: ["◐ Referências", "Cabo do martelo e triângulo luminoso: mostrar/esconder"] },
    laringe: { construir: construirLaringe, incl: 0, y: -0.15,
      vistas: [["cima", "De cima", [0, 0, 0]], ["obliqua", "Oblíqua", [0.6, 0, 0]], ["lado", "Lado", [0, -1.2, 0]]],
      alternar: ["◐ Contorno", "Parede da faringe: mostrar/esconder"] },
    olho: { construir: construirOlho, incl: 0, y: 0,
      vistas: [["frente", "Frente", [0, 0, 0]], ["obliqua", "Oblíqua", [0.3, -0.5, 0]], ["lado", "Lado", [0, -1.45, 0]]],
      alternar: ["◐ Camadas", "Tira a córnea, depois a câmara anterior, para marcar a íris e o cristalino"] },
    fundo: { construir: construirFundo, incl: 0, y: 0,
      vistas: [["frente", "Retinografia", [0, 0, 0]]],
      alternar: ["◐ Vasos", "Vasos e fóvea: mostrar/esconder"] },
    odonto: { construir: construirOdonto, incl: 0, y: 0, dist: 8.6,
      vistas: [["frente", "Odontograma", [0, 0, 0]]],
      alternar: ["◐ Decíduos", "Dentes decíduos (fileiras de dentro): mostrar/esconder"] },
    mama: { construir: construirMama, incl: 0, y: -0.2, dist: 8.4,
      vistas: [["frente", "De frente", [0, 0, 0]]],
      alternar: ["◐ Relógio", "As horas (12, 3, 6, 9) em volta de cada mama: mostrar/esconder"] }
  };

  function montarModelo(nome) {
    var T = window.THREE, M = MODELOS[nome] || MODELOS.coracao;
    if (!G.corpo || G.modeloMontado === nome) return;
    while (G.corpo.children.length) {
      var c = G.corpo.children[0];
      G.corpo.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material && c.material.dispose) c.material.dispose();
    }
    G.malhas = []; G.camaras = []; G.camarasOcultas = false; G.camadas = null; G.nivel = 0;
    G.corpo.rotation.set(0, 0, M.incl);
    G.corpo.position.set(0, M.y, 0);
    M.construir(T);
    // Odontograma do paciente: abre sem os decíduos, a não ser que o mapa
    // tenha achado num deles (esconder achado seria pior). ◐ mostra.
    if (S.paciente && nome === "odonto" && !temDeciduo()) alternarCamaras();
    G.marcasGrupo = new T.Group();
    G.corpo.add(G.marcasGrupo);
    G.modeloMontado = nome;
    var bar = document.getElementById("cor_vistas");
    if (bar) {
      limpar(bar);
      M.vistas.forEach(function (v) {
        bar.appendChild(el("button", { type: "button", text: v[1], title: "Vista " + v[1].toLowerCase(), onclick: function () { vista(v[0]); } }));
      });
      bar.appendChild(el("button", { type: "button", text: M.alternar[0], title: M.alternar[1], onclick: function () { alternarCamaras(); } }));
      bar.appendChild(el("button", { type: "button", text: "＋", title: "Aproximar", "aria-label": "Aproximar", onclick: function () { zoom(0.8); } }));
      bar.appendChild(el("button", { type: "button", text: "－", title: "Afastar", "aria-label": "Afastar", onclick: function () { zoom(1.25); } }));
    }
    vista(M.vistas[0][0]);
  }

  function temDeciduo() {
    return Object.keys((S.atual && S.atual.regioes) || {}).some(function (id) { return /^d[5-8]\d/.test(id); });
  }

  function alternarCamaras() {
    // camadas (olho): cada clique tira mais uma (córnea, depois câmara) e volta
    if (G.camadas && G.camadas.length) {
      G.nivel = (G.nivel + 1) % (G.camadas.length + 1);
      G.camadas.forEach(function (grp, i) { grp.forEach(function (m) { m.visible = i >= G.nivel; }); });
      return;
    }
    G.camarasOcultas = !G.camarasOcultas;
    (G.camaras || []).forEach(function (m) { m.visible = !G.camarasOcultas; });
  }

  function vista(v) {
    if (!G.coracao) return;
    var M = MODELOS[G.modeloMontado] || MODELOS.coracao;
    var r = (M.vistas.filter(function (x) { return x[0] === v; })[0] || M.vistas[0])[2];
    G.coracao.rotation.set(r[0], r[1], r[2]);
    // Tela em pé (celular): afasta a câmera para caber a largura do desenho
    if (G.camera) G.camera.position.set(0, 0.1, (M.dist || 7.2) * Math.max(1, 1.05 / (G.camera.aspect || 1)));
  }

  function limiteZoom(z) { return Math.max(2.5, Math.min(18, z)); }
  function zoom(f) { if (G.camera) G.camera.position.z = limiteZoom(G.camera.position.z * f); }

  // ── cores e marcas ────────────────────────────────────────────────────
  function colorir() {
    if (!G.malhas || !S.cat) return;
    G.malhas.forEach(function (m) {
      var d = m.userData, v = S.atual && S.atual.regioes[d.id], a = v && achado(d.grupo, v.achado);
      m.material.color.set(a ? a[2] : corBase(d.grupo));
      m.material.emissive.set(S.sel === d.id ? 0x7c2d12 : 0x000000);
      m.material.emissiveIntensity = S.sel === d.id ? 0.55 : 0;
    });
  }

  function desenharMarcas() {
    var T = window.THREE;
    if (!T || !G.marcasGrupo) return;
    while (G.marcasGrupo.children.length) G.marcasGrupo.remove(G.marcasGrupo.children[0]);
    ((S.atual && S.atual.marcas) || []).forEach(function (m, i) {
      var esf = new T.Mesh(new T.SphereGeometry(0.05, 16, 12), new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0x111827, emissiveIntensity: 0.2 }));
      esf.position.set(m.pos[0], m.pos[1], m.pos[2]);
      esf.userData = { marca: m.id };
      G.marcasGrupo.add(esf);
      var cv = document.createElement("canvas"); cv.width = 64; cv.height = 64;
      var ctx = cv.getContext("2d");
      ctx.fillStyle = "#1f2937"; ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 30px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), 32, 34);
      var sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), depthTest: false }));
      sp.scale.set(0.16, 0.16, 0.16);
      sp.position.set(m.pos[0] * 1.08, m.pos[1] * 1.08 + 0.1, m.pos[2] * 1.08);
      sp.renderOrder = 5;
      G.marcasGrupo.add(sp);
    });
  }

  // ── interação: girar, aproximar, clicar ───────────────────────────────
  function interacao(T, palco) {
    var cv = G.renderer.domElement, ray = new T.Raycaster(), mouse = new T.Vector2();
    var arrasto = null, moveu = 0;
    function alvo(ev) {
      var r = cv.getBoundingClientRect();
      mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(mouse, G.camera);
      var vis = G.malhas.filter(function (m) { return m.visible; });
      var hits = ray.intersectObjects(vis, false);
      if (!hits.length) return null;
      // opaco tem preferência: o VD e os átrios são transparentes
      return hits.filter(function (h) { return !h.object.userData.transp; })[0] || hits[0];
    }
    // Dois dedos = pinça (zoom), no celular do paciente e no tablet do médico
    var dedos = {}, pinca = null;
    function distDedos() {
      var p = Object.keys(dedos).map(function (k) { return dedos[k]; });
      return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
    }
    cv.addEventListener("pointerdown", function (ev) {
      dedos[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      cv.setPointerCapture(ev.pointerId);
      if (Object.keys(dedos).length === 2) {   // começou a pinça: para de girar
        pinca = { d: distDedos(), z: G.camera.position.z }; arrasto = null; moveu = 99;
        return;
      }
      arrasto = { x: ev.clientX, y: ev.clientY }; moveu = 0;
    });
    cv.addEventListener("pointermove", function (ev) {
      var tip = document.getElementById("cor_tip");
      if (dedos[ev.pointerId]) dedos[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      if (pinca && Object.keys(dedos).length >= 2) {
        G.camera.position.z = limiteZoom(pinca.z * pinca.d / distDedos());
        if (tip) tip.style.display = "none";
        return;
      }
      if (arrasto) {
        var dx = ev.clientX - arrasto.x, dy = ev.clientY - arrasto.y;
        moveu += Math.abs(dx) + Math.abs(dy);
        G.coracao.rotation.y += dx * 0.01;
        G.coracao.rotation.x = Math.max(-1.6, Math.min(1.6, G.coracao.rotation.x + dy * 0.01));
        arrasto = { x: ev.clientX, y: ev.clientY };
        if (tip) tip.style.display = "none";
        return;
      }
      var h = alvo(ev);
      if (tip) {
        if (h) {
          var r = regiao(h.object.userData.id), v = S.atual && S.atual.regioes[h.object.userData.id];
          var a = v && achado(r.grupo, v.achado);
          tip.textContent = r.nome + (a ? " — " + a[1] : "");
          var b = palco.getBoundingClientRect();
          tip.style.left = (ev.clientX - b.left + 12) + "px"; tip.style.top = (ev.clientY - b.top + 12) + "px";
          tip.style.display = "block";
        } else tip.style.display = "none";
      }
    });
    function soltar(ev) {
      delete dedos[ev.pointerId];
      if (Object.keys(dedos).length < 2) pinca = null;
    }
    cv.addEventListener("pointercancel", function (ev) { soltar(ev); arrasto = null; });
    cv.addEventListener("pointerup", function (ev) {
      soltar(ev);
      var foiClique = arrasto && moveu < 6;
      arrasto = null;
      var tip0 = document.getElementById("cor_tip");
      if (tip0) tip0.style.display = "none";   // a dica mostrava o achado de antes do clique
      if (!foiClique || !S.cat) return;
      var h = alvo(ev);
      if (!h) return;
      var id = h.object.userData.id, grupo = h.object.userData.grupo;
      if (S.modo === "selecionar") { selecionar(id); return; }
      if (!S.atual) { novo(false); }
      if (!editavel()) { aviso("Este mapa não pode ser alterado por você. Use ⧉ Copiar para novo exame."); return; }
      if (S.modo === "pintar") {
        var pc = (S.pincel || "").split("|");
        if (pc[0] !== grupo) { aviso("O achado escolhido é de " + S.cat.grupos[pc[0]] + "; esta região é de " + S.cat.grupos[grupo] + "."); return; }
        var atual = (S.atual.regioes[id] || {}).achado;
        S.sel = id;
        definir(id, atual === pc[1] ? "" : pc[1], null);
        return;
      }
      if (S.modo === "marcar") {
        var p = G.corpo.worldToLocal(h.point.clone());
        var m = { id: uid(), regiao: id, pos: [p.x, p.y, p.z], texto: "" };
        S.atual.marcas.push(m);
        desenharMarcas(); sujo(); painel();
        var inp = document.getElementById("cor_marca_" + m.id);
        if (inp) inp.focus();
      }
    });
    cv.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      G.camera.position.z = limiteZoom(G.camera.position.z + ev.deltaY * 0.004);
    }, { passive: false });
  }

  // ── dados do servidor ─────────────────────────────────────────────────
  function receber(d) {
    if (!montar()) return;
    var trocou = d.paciente_id !== S.pid || (d.modelo || "coracao") !== S.modelo;
    S.modelo = d.modelo || "coracao"; S.modelos = d.modelos || [];
    S.cat = d.catalogo; S.mapas = d.mapas || []; S.pid = d.paciente_id || "";
    if (trocou) S.pincel = "";
    var tt = document.getElementById("coracao_titulo");
    if (tt && S.cat) tt.textContent = (S.cat.icone || "") + " " + (S.cat.nome || "Mapa") + " 3D";
    S.consulta = !!d.somente_consulta;
    S.ia = !!d.ia; S.fontes = d.fontes || []; S.linhaTempo = d.linha_tempo || []; S.extraindo = false;
    S.indidocAuto = !!d.indidoc_auto; S.indidocAtivo = !!d.indidoc_ativo;
    S.plano = d.plano || {};
    var np = document.getElementById("coracao_paciente");
    if (np) np.textContent = d.paciente_nome || "";
    if (trocou) { S.atual = null; S.sel = null; S.dirty = false; }
    else if (S.atual && S.atual.id) {
      var m = S.mapas.filter(function (x) { return x.id === S.atual.id; })[0];
      if (m && !S.dirty) { S.atual = JSON.parse(JSON.stringify(m)); S.atual.regioes = S.atual.regioes || {}; S.atual.marcas = S.atual.marcas || []; }
    }
    if (S.salvoId) {
      var s = S.mapas.filter(function (x) { return x.id === S.salvoId; })[0];
      if (s) { S.atual = JSON.parse(JSON.stringify(s)); S.atual.regioes = S.atual.regioes || {}; S.atual.marcas = S.atual.marcas || []; S.dirty = false; }
      S.salvoId = null;
    }
    if (!S.atual && S.mapas.length) {
      var ativo = S.mapas.filter(function (x) { return !x.inativo_em; })[0];
      if (ativo) { S.atual = JSON.parse(JSON.stringify(ativo)); S.atual.regioes = S.atual.regioes || {}; S.atual.marcas = S.atual.marcas || []; }
    }
    preencherPincel();
    painel();
    carregarThree(d.three, function () { cena(); montarModelo(S.modelo); redimensionar(); colorir(); desenharMarcas(); });
  }

  // Modo paciente: quem chama é o app do indiDoc, com os dados do mapa
  // (o mesmo formato de "coracao_dados", com um mapa só)
  window.MapaAnatomico = {
    mostrar: function (d) {
      S.paciente = true;
      S.planoPaciente = d.plano || [];
      receber({ paciente_id: d.paciente_id || "paciente", catalogo: d.catalogo, modelo: d.modelo,
                mapas: [Object.assign({ id: "mapa", editavel: false }, d.mapa || {})],
                somente_consulta: true, three: d.three });
      setTimeout(redimensionar, 50);
    },
    redimensionar: function () { redimensionar(); }
  };

  function registrar() {
    if (S.paciente) return;
    if (!window.Shiny || !Shiny.addCustomMessageHandler) return setTimeout(registrar, 100);
    Shiny.addCustomMessageHandler("coracao_dados", function (d) { receber(d); });
    Shiny.addCustomMessageHandler("coracao_salvo", function (d) { S.salvoId = d && d.id; S.dirty = false; });
    Shiny.addCustomMessageHandler("coracao_sugestao", function (d) { sugestao(d); });
    Shiny.addCustomMessageHandler("coracao_plano", function (d) { if (d && d.mapa_id) { S.plano[d.mapa_id] = d.plano || {}; painel(); } });
  }

  // A IA devolveu um RASCUNHO: entra como mapa novo, não salvo, para revisar
  function sugestao(d) {
    S.extraindo = false;
    if (!d || d.erro || !d.mapa) { painel(); aviso((d && d.erro) || "A IA não respondeu."); return; }
    var m = d.mapa;
    S.atual = { id: null, editavel: true, exame_tipo: m.exame_tipo, exame_data: m.exame_data, regioes: m.regioes || {},
                marcas: [], observacoes: m.observacoes || "", origem: "ia", fonte_ref: m.fonte_ref || "" };
    S.sugestao = d.fonte || null;
    S.sel = null; S.dirty = true;
    colorir(); desenharMarcas(); painel();
  }

  // ── tela cheia: o botão ❤️ Coração do Resumo abre; ✕ ou Esc fecha ─────
  window.coracaoAbrir = function () {
    var ov = document.getElementById("coracao_overlay");
    if (!ov) return;
    ov.style.display = "block";
    document.body.style.overflow = "hidden";
    if (window.Shiny && Shiny.setInputValue) Shiny.setInputValue("coracao_abrir", { t: Date.now(), modelo: S.modelo || "" }, { priority: "event" });
    setTimeout(redimensionar, 50);
  };
  window.coracaoFechar = function () {
    var ov = document.getElementById("coracao_overlay");
    if (!ov || ov.style.display === "none") return;
    if (S.dirty && !window.confirm("Há alterações não salvas no mapa. Fechar mesmo assim?")) return;
    if (S.tocando) { clearInterval(S.tocando); S.tocando = null; }
    S.dirty = false;
    ov.style.display = "none";
    document.body.style.overflow = "";
  };
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") window.coracaoFechar(); });
  registrar();
})();
