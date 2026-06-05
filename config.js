window.APPSEL_CONFIG = {
  // Cole aqui a URL /exec da implantacao Web App do Apps Script da DECOF.
  // Exemplo: https://script.google.com/macros/s/SEU_ID_DE_IMPLANTACAO/exec
  apiUrl: "https://script.google.com/macros/s/AKfycbysFfbpofy4bf0qODi429gKX0dd621Si08_P9_e4nBajeuth1UV8cD4gu8JKtR2_TWcYw/exec",

  // Municipio usado para simular prazos no navegador. O Apps Script tambem
  // deve ter SEL_MUNICIPIO_CALENDARIO com o mesmo valor.
  municipioCalendario: "Rio de Janeiro",

  // Tempo maximo de espera das chamadas ao Apps Script.
  apiTimeoutMs: 90000,

  // Link rapido para o Painel publico de Contratacoes.
  painelUrl: "https://decofcp2-afk.github.io/painel-contratacoes-reitoria/"
};
