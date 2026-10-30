/* ═══════════════════════════════════════════════════════════════════════
   MINHA CONTA EM SEÇÕES (30/10/2026, pedido do usuário)

   A Conta tinha seis cartões abertos um embaixo do outro — pessoas, plano,
   cuidar junto, acesso, ajuda — e era preciso rolar para saber o que havia
   nela. Agora cada cartão é uma SEÇÃO fechada: só o título e um resumo de
   uma linha ("2 de 2 pessoas", "Grátis · 37 de 100 documentos"). Toque no
   título e ela abre; abrir uma fecha as outras, e a tela inteira cabe sem
   rolar. O cartão de uso (#conta-uso) e a faixa ⚠️/✅ do acesso
   (#conta-estado) saíram da vista: viraram os resumos do plano e do acesso.

   Abertas de saída só quando pedem ação: "Guarde seu acesso" na conta sem
   e-mail, e a seção que outra tela mandou abrir (Plano.verPlanos, voltar ao
   acervo). O conteúdo de cada cartão continua com quem o desenha (app.js,
   plano.js, cuidar.js): aqui só se esconde e se resume.

   Carregado depois de app.js e plano.js (usa `consumo`, `contaAnonima`,
   `usuario`).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  const tela = document.getElementById("tela-conta");
  if (!tela) return;
  const SECOES = ["conta-pessoas-cartao", "conta-plano", "conta-cuidar-cartao",
                  "conta-proteger", "conta-pronta", "conta-ajuda"];
  let aberta = null;          // a seção aberta agora (uma só)

  function resumo(id) {
    try { return resumoDe(id); } catch (e) { return ""; }   // app.js ainda sem `consumo`
  }

  function resumoDe(id) {
    const c = (typeof consumo !== "undefined" && consumo) || {};
    if (id === "conta-pessoas-cartao") {   // os nomes, sem precisar abrir
      const proprias = pessoasProprias();
      const nomes = proprias.map((p) => {
        const rot = ROTULO_PARENTESCO[p.parentesco];
        return nomeDaPessoa(p) + (rot && p.parentesco !== "eu" ? ` (${rot})` : "");
      });
      const teto = c.teto_pessoas || 2;
      return (nomes.length ? nomes.join(", ") : "Só você") + ` · ${proprias.length || 1} de ${teto}`;
    }
    if (id === "conta-plano") {   // o uso (antes num cartão próprio, #conta-uso) mora aqui
      const usados = (c.documentos ?? 0) + ((typeof naFila !== "undefined" && naFila) ? naFila.length : 0);
      let t = `${usados} de ${c.teto ?? 100} documentos seus`
        + (c.bytes ? ` · ${(c.bytes / 1048576).toFixed(1).replace(".", ",")} MB` : "");
      if (c.plano === "familia" && c.plano_ate) {
        t += ` · vale até ${new Date(c.plano_ate).toLocaleDateString("pt-BR")}`;
      }
      return t;
    }
    if (id === "conta-cuidar-cartao") {   // quem cuida junto, já na linha do título
      const eu = (usuario && usuario.id) || "";
      const comp = (typeof compartilhamentos !== "undefined" && compartilhamentos) || [];
      const agora = new Date().toISOString();
      const cuidam = comp.filter((x) => x.conta_dona === eu && x.aceito_em)
        .map((x) => x.convidado_nome || "outra conta");
      const abertos = comp.filter((x) => x.conta_dona === eu && !x.aceito_em && x.convite_expira > agora).length;
      const cuido = pessoas.filter((p) => p.compartilhada).map((p) => nomeDaPessoa(p));
      const partes = [];
      if (cuidam.length) partes.push("Cuidam junto: " + [...new Set(cuidam)].join(", "));
      if (cuido.length) partes.push("Você cuida de: " + cuido.join(", "));
      if (abertos) partes.push(abertos === 1 ? "1 convite aberto" : `${abertos} convites abertos`);
      return partes.length ? partes.join(" · ") : "Só você, por enquanto. Toque para convidar alguém";
    }
    if (id === "conta-proteger") return "⚠️ Ainda não guardado: se o celular for limpo ou trocado, você perde o acervo";
    if (id === "conta-pronta") {
      const email = (typeof usuario !== "undefined" && usuario && usuario.email) || "";
      return email ? `✅ Ligado a ${email}` : "✅ Você abre seus documentos em outro celular";
    }
    if (id === "conta-ajuda") return "Como funciona, guia rápido, termo e encerrar conta";
    return "";
  }

  function preparar(cartao) {
    const h3 = cartao.querySelector(":scope > h3");
    if (!h3) return;
    cartao.classList.add("secao");
    h3.setAttribute("role", "button");
    h3.setAttribute("tabindex", "0");
    let r = cartao.querySelector(":scope > .secao-resumo");
    if (!r) {
      r = document.createElement("div");
      r.className = "secao-resumo";
    }
    if (h3.nextSibling !== r) h3.after(r);       // plano.js redesenha o cartão inteiro
    r.textContent = resumo(cartao.id);
    const fechada = cartao.id !== aberta;
    cartao.classList.toggle("fechada", fechada);
    h3.setAttribute("aria-expanded", fechada ? "false" : "true");
  }

  function organizar() {
    SECOES.forEach((id) => {
      const c = document.getElementById(id);
      if (c) preparar(c);
    });
  }

  function abrir(id) {
    aberta = id;
    organizar();
  }

  function alternar(id) {
    abrir(aberta === id ? null : id);
    const c = document.getElementById(id);
    if (aberta === id && c) setTimeout(() => c.scrollIntoView({ block: "nearest", behavior: "smooth" }), 30);
  }

  // Um clique no título (delegado: o plano redesenha o h3 a cada vez).
  tela.addEventListener("click", (e) => {
    const h3 = e.target.closest(".conta-cartao.secao > h3");
    if (h3) alternar(h3.parentElement.id);
  });
  tela.addEventListener("keydown", (e) => {
    const h3 = e.target.closest && e.target.closest(".conta-cartao.secao > h3");
    if (h3 && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); alternar(h3.parentElement.id); }
  });

  // Ao abrir a Conta: tudo fechado, menos o que pede ação.
  function aoAbrir(recuperando) {
    const anonima = typeof contaAnonima === "function" && contaAnonima();
    abrir(recuperando || anonima ? "conta-proteger" : null);
  }

  window.ContaSecoes = { organizar, abrir, aoAbrir };
})();
