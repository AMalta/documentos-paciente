/* TELAS DO APP (07/10). O Início mostra os atalhos espalhados na tela —
   Guardar exame em destaque, Documentos, Ao médico, Agenda e Conversas — no
   lugar da barra de baixo. Agenda e Documentos são a tela de sempre, cada
   uma mostrando só a sua parte (classes no body, CSS "TELAS"), com
   ← Início no topo. Conversas e Mostrar ao médico abrem por cima e, ao
   fechar, deixam o Início à vista. Carregado depois de conversa.js. */
(function () {
  if (!window.Conversa) return;
  const q = (id) => document.getElementById(id);
  let atual = "inicio";

  function ir(aba) {
    if (aba === "mostrar") { q("btn-mostrar").click(); return; }
    if (aba === "conversas") { Conversa.abrir(); return; }
    atual = aba;
    for (const a of ["inicio", "agenda", "documentos"]) document.body.classList.toggle("aba-" + a, aba === a);
    const t = q("titulo-aba");
    if (t) t.textContent = { inicio: "indiDoc", agenda: "Agenda", documentos: "Meus documentos" }[aba] || "";
    if (aba === "inicio") {
      // Os cartões da consulta buscam o que mudou e redesenham o Início.
      if (window.PreConsulta) PreConsulta.atualizar();
      if (window.DepoisConsulta) DepoisConsulta.atualizar();
      desenharInicio();
    }
    window.scrollTo(0, 0);
  }

  // Números vivos nos cartões e os avisos da consulta (véspera/dia e
  // "Depois da consulta"). Barato: só lê o que já está em memória.
  function desenharInicio() {
    try {
      const n = typeof docsDaPessoa === "function" ? docsDaPessoa().length : 0;
      q("ini-docs-sub").textContent = n ? `${n} guardado${n > 1 ? "s" : ""}` : "Nenhum ainda";
      const p = typeof compromissos === "undefined" ? null
        : proximosCompromissos(compromissos, 3).find((x) => diasAte(x.quando) >= 0);
      const falta = p && comoFalta(diasAte(p.quando)).texto;
      q("ini-agenda-sub").textContent = p ? `Próxima: ${falta}` : "Anotar consulta ou exame";
    } catch (e) { /* antes de entrar: os cartões ficam sem número */ }
    const av = q("ini-avisos"), dp = q("ini-depois");
    av.innerHTML = ""; dp.innerHTML = "";
    const f = Conversa.faixaConsulta();
    if (f) av.appendChild(f);
    const dc = window.DepoisConsulta && DepoisConsulta.cartoesInicio();
    if (dc) dp.appendChild(dc);
  }

  for (const b of document.querySelectorAll("#inicio [data-ir]")) b.onclick = () => ir(b.dataset.ir);
  // A câmera tem de abrir no mesmo toque (o navegador exige gesto do usuário).
  q("ini-fotografar").onclick = () => { ir("documentos"); q("btn-fotografar").click(); };
  q("ini-pdf").onclick = () => { ir("documentos"); q("btn-pdf").click(); };
  q("ini-guia").onclick = () => window.Guia && Guia.abrir();
  const fecharAba = q("btn-fechar-aba");
  if (fecharAba) fecharAba.onclick = () => ir("inicio");

  document.body.classList.add("com-abas", "aba-inicio");
  window.Abas = { ir, atual: () => atual, desenharInicio };
})();
