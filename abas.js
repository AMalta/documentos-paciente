/* ABAS DE BAIXO, como o WhatsApp. 💬 Conversas é o início; 📅 Agenda e
   📁 Documentos são a tela de sempre, cada uma mostrando só a sua parte
   (classes no body, CSS "ABAS DE BAIXO"); 🩺 Mostrar abre o
   mostrar-ao-médico. Carregado depois de conversa.js. */
(function () {
  const nav = document.getElementById("nav-baixo");
  if (!nav || !window.Conversa) return;
  let atual = "conversas";

  function ir(aba) {
    if (aba === "mostrar") { document.getElementById("btn-mostrar").click(); return; }
    atual = aba;
    document.body.classList.toggle("aba-agenda", aba === "agenda");
    document.body.classList.toggle("aba-documentos", aba === "documentos");
    const t = document.getElementById("titulo-aba");
    if (t) t.textContent = { agenda: "Agenda", documentos: "Meus documentos" }[aba] || "";
    for (const b of nav.querySelectorAll("button[data-aba]")) b.classList.toggle("on", b.dataset.aba === aba);
    if (aba === "conversas") Conversa.inicio(); else Conversa.sairDoInicio();
    window.scrollTo(0, 0);
  }
  for (const b of nav.querySelectorAll("button[data-aba]")) b.onclick = () => ir(b.dataset.aba);

  document.body.classList.add("com-abas");
  window.Abas = { ir, atual: () => atual };
})();
