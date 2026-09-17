/* ═══════════════════════════════════════════════════════════════════════
   Termo de consentimento.

   Foto de exame traz nome, CPF e resultado — dado pessoal sensível, artigo
   11 da LGPD. Consentimento aqui precisa ser ATO AFIRMATIVO e informado:
   uma frase no rodapé dizendo "seus dados estão seguros" não é aceite, e
   um botão "Começar" sozinho também não.

   Mas parede de texto jurídico não é informar — é a forma mais eficiente de
   garantir que ninguém leia. Daí o desenho em duas camadas: seis frases que
   respondem o que a lei exige (o quê, onde, quem vê, por quanto tempo, e o
   que isto NÃO é), e o texto completo a um toque para quem quiser.

   A VERSÃO é guardada junto da data no banco. "O usuário aceitou" não
   demonstra nada seis meses depois, quando o texto já mudou — só o par
   data+versão sustenta o que foi aceito.
   ═══════════════════════════════════════════════════════════════════════ */
window.TERMO = {
  versao: "2026-09-17",

  // As seis frases da tela. Cada uma responde uma pergunta da LGPD sem
  // usar a palavra da LGPD.
  resumo: [
    ["📷", "Só entra o que você fotografar",
     "Nada é buscado em laboratório, convênio ou hospital. O acervo é o que "
     + "você escolher guardar."],
    ["🔒", "Ninguém vê sem você liberar",
     "Nem médico, nem clínica, nem laboratório. Para mostrar a um médico, "
     + "você gera um código na hora da consulta, e o acesso dele vence no "
     + "mesmo dia."],
    ["🇧🇷", "Fica guardado em servidor no Brasil",
     "Suas imagens ficam em servidor localizado no Brasil, com acesso "
     + "restrito à sua conta."],
    ["🗑️", "Você apaga quando quiser",
     "Qualquer documento, ou a conta inteira, sem pedir autorização a "
     + "ninguém. Apagou, sai do servidor."],
    ["⏳", "Fica enquanto você quiser",
     "Não há prazo de validade. Seus documentos ficam até você apagá-los ou "
     + "encerrar a conta."],
    ["📋", "Isto não é o seu prontuário",
     "É a sua cópia pessoal dos documentos. Não substitui o registro do seu "
     + "médico, e durante esta fase de testes guarde também os papéis "
     + "originais."],
  ],

  completo: `COMO SEUS DOCUMENTOS SÃO GUARDADOS

1. O QUE É GUARDADO
Apenas as fotografias que você tirar ou escolher no seu celular, e as
informações que você digitar sobre elas: tipo de documento, nome e data.
Nenhum dado é buscado automaticamente em laboratórios, convênios, hospitais
ou no seu aparelho.

2. PARA QUE SERVE
Para você ter seus exames, laudos, receitas e relatórios reunidos e
organizados, e poder mostrá-los ao médico sem carregar papel.

3. QUEM PODE VER
Somente você. Nenhum médico, clínica, laboratório ou empresa tem acesso ao
seu acervo.

Quando você quiser mostrar seus documentos a um médico, será você quem gera
um código dentro do aplicativo e o entrega a ele. Esse código vale por poucos
minutos e o acesso do médico termina no mesmo dia. Você pode ver, a qualquer
momento, quem abriu seu acervo e quando, e pode cancelar acessos.

4. ONDE FICA GUARDADO
Em servidor localizado no Brasil, com acesso restrito à sua conta. O sistema
é organizado de modo que uma conta não alcance os documentos de outra.

5. POR QUANTO TEMPO
Pelo tempo que você quiser. Não há prazo de validade e não há exclusão
automática. Seus documentos permanecem até que você os apague ou encerre a
conta.

6. COMO APAGAR
Dentro do aplicativo você pode apagar qualquer documento individualmente, ou
encerrar sua conta e apagar tudo de uma vez. O que é apagado sai do servidor.

7. SEU E-MAIL
Usado apenas para você conseguir voltar aos seus documentos em outro celular,
ou neste mesmo caso ele seja trocado ou limpo. Não é usado para propaganda e
não é repassado a médicos, clínicas ou laboratórios.

8. O QUE ESTE APLICATIVO NÃO É
Não é o seu prontuário médico e não substitui os registros do seu médico ou
da clínica, que seguem com as obrigações legais deles. Não é laudo, não é
diagnóstico e não interpreta resultados. É a sua cópia pessoal, organizada,
de documentos que já são seus.

9. FASE DE TESTES
Este aplicativo está em fase de testes com um grupo pequeno de pessoas.
Durante esse período, continue guardando os documentos originais em papel.

10. SEUS DIREITOS
Você pode, a qualquer momento, consultar, corrigir, apagar seus dados ou
retirar este consentimento, sem precisar justificar. Retirar o consentimento
significa encerrar a conta e apagar os documentos guardados.`,
};
