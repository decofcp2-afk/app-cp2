/* ============================================================================
   config.js — ADAPTADOR SUPABASE do APP de Gestão (réplica fiel)
   Mantém o index.html intocado. Intercepta as chamadas RPC (route=appsel.*)
   e as roteia para o Supabase. Login via Supabase Auth (e-mail @cp2.g12.br).
   1ª fatia: login + leitura (getEtapasParaApp). Gravações: stubs (em construção).
   ============================================================================ */
(function () {
  var SB_URL = "https://fhgqixzufmgebwfffdai.supabase.co";
  var SB_KEY = "sb_publishable_O_m4yrige70t94drd8NGrQ_In80Vn32";
  var SCHEMA = "contratacoes";
  var DOMINIO = "@cp2.g12.br";
  var SENTINEL_LIST = ["script.google.com", "/macros/", "supabase-adapter.local"];

  // Mantém a forma esperada pelo index.html (lê APPSEL_CONFIG.apiUrl para montar a requisição).
  window.APPSEL_CONFIG = {
    apiUrl: "https://supabase-adapter.local/appsel",
    municipioCalendario: "Rio de Janeiro",
    apiTimeoutMs: 30000,
    painelUrl: "https://decofcp2-afk.github.io/painel-cp2/"
  };

  // ---- supabase-js ----
  var sbReady = new Promise(function (resolve) {
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s.onload = function () { resolve(window.supabase.createClient(SB_URL, SB_KEY, { db: { schema: SCHEMA }, auth: { persistSession: true, autoRefreshToken: true } })); };
    document.head.appendChild(s);
  });
  function db(sb){ return sb.schema(SCHEMA); }

  // ---- credenciais digitadas (capturadas antes do hash do app) ----
  var cred = { email: "", senha: "" };
  function normEmail(v){ v=String(v||"").trim(); if(!v) return ""; return v.indexOf("@")>=0 ? v : (v + DOMINIO); }
  document.addEventListener("input", function (ev) {
    var t = ev.target;
    if (!t || !t.id) return;
    if (t.id === "login-matricula") cred.email = normEmail(t.value);
    if (t.id === "login-senha") cred.senha = t.value;
  }, true);
  // troca o rótulo do campo para e-mail
  function ajustarLabelLogin(){
    var f = document.getElementById("login-matricula");
    if (f){ f.placeholder = "E-mail (@cp2.g12.br)"; f.type = "text"; f.autocomplete = "username"; }
  }
  document.addEventListener("DOMContentLoaded", ajustarLabelLogin);
  setTimeout(ajustarLabelLogin, 400); setTimeout(ajustarLabelLogin, 1200);

  // ---- helpers de cálculo (modo 'corridos', usa datas já gravadas) ----
  function parseISO(s){ if(!s) return null; var p=String(s).slice(0,10).split("-"); if(p.length<3) return null; var d=new Date(+p[0],+p[1]-1,+p[2]); return isNaN(d)?null:d; }
  function toIso(s){ var d=parseISO(s); if(!d) return null; return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  function daysBetween(a,b){ var x=parseISO(a),y=parseISO(b); if(!x||!y) return 0; return Math.round((y-x)/86400000); }
  function stEtapa(s){ s=String(s||"").trim().toLowerCase(); if(s==="naoaplica"||s==="na") return "na"; return s||"planejamento"; }

  // ---- perfil do usuário logado ----
  function getProfile(sb){
    return db(sb).from("usuario").select("id,nome,matricula,email,papel,unidade_id").maybeSingle().then(function(r){ return r.data; });
  }
  function sessaoPayload(sb, user){
    return getProfile(sb).then(function(prof){
      var papel = prof ? prof.papel : "servidor";
      return {
        ok: true,
        token: (sb.auth && sb.auth.getSession) ? "sb-session" : "sb-session",
        exp: Date.now() + 8*3600*1000,
        nome: (prof && prof.nome) || (user && user.email) || "Usuário",
        matricula: (prof && prof.matricula) || (user && user.email) || "",
        isChefe: papel === "chefia" || papel === "admin",
        mustChange: false,
        servidores: []
      };
    });
  }

  // ---- leitura: getEtapasParaApp ----
  function montarEtapasApp(sb){
    return db(sb).from("processo")
      .select("id,num_suap,objeto,modalidade,d0,tem_irp,link_suap,status,setor_requisitante,email_requisitante,ordem_fila,etapa(linha:ordem,prazo:prazo_dias,nome,agente:agente_responsavel,fase,status_etapa,motivo:motivo_atraso,prazo_ini,prazo_fim,data_realizacao,ordem)")
      .order("num_suap")
      .then(function(rp){
        var procs = (rp.data || []).map(function(p){
          var ets = (p.etapa||[]).slice().sort(function(a,b){return (a.ordem||0)-(b.ordem||0);})
            .filter(function(e){ return stEtapa(e.status_etapa) !== "na"; });
          var etapaAtualIdx = -1;
          var etCalc = ets.map(function(e, idx){
            var st = stEtapa(e.status_etapa);
            var iniIso = toIso(e.prazo_ini), fimIso = toIso(e.prazo_fim);
            var realIso = (st==="ok" && e.data_realizacao) ? toIso(e.data_realizacao) : null;
            var dias = (realIso && (e.prazo||0)>0) ? Math.max(0, daysBetween(fimIso, realIso)) : 0;
            if (etapaAtualIdx<0 && st!=="ok" && st!=="na") etapaAtualIdx = idx;
            return {
              linha: e.ordem, prazo: e.prazo||0, nome: e.nome, agente: e.agente||"", fase: e.fase||"",
              status: st, retornoFila: false, motivo: e.motivo||"", dias: dias,
              ini_iso: iniIso, fim_iso: fimIso, realizacao_iso: realIso, historico: null
            };
          });
          var semNA = etCalc.filter(function(e){return e.status!=="na";});
          var concl = semNA.filter(function(e){return e.status==="ok";}).length;
          var execucao = semNA.length ? Math.round(concl/semNA.length*100) : 0;
          var temAtras = etCalc.some(function(e){return e.dias>0;});
          var st = execucao===100 ? "ok"
            : temAtras ? "atrasado"
            : etCalc.some(function(e){return e.status==="aguardando";}) ? "aguardando"
            : etCalc.some(function(e){return e.status==="paralisado";}) ? "paralisado"
            : etCalc.some(function(e){return e.status==="andamento";}) ? "andamento"
            : concl>0 ? "andamento"
            : (p.status || "planejamento");
          var mNorm = String(p.modalidade||"").toLowerCase();
          var mAbrev = (mNorm.indexOf("preg")>=0 || mNorm.indexOf("concorr")>=0) ? "PE" : (mNorm.indexOf("direta")>=0||mNorm.indexOf("dispensa")>=0?"CD":(p.modalidade||"PE"));
          var srvInt=""; for(var i=0;i<etCalc.length;i++){ if((etCalc[i].fase||"").toLowerCase().indexOf("ext")<0 && etCalc[i].agente){ srvInt=etCalc[i].agente; break; } }
          var srvExt=""; for(var j=0;j<etCalc.length;j++){ if((etCalc[j].fase||"").toLowerCase().indexOf("ext")>=0 && etCalc[j].agente){ srvExt=etCalc[j].agente; break; } }
          return {
            id: p.id, num: p.num_suap||p.id, nome: p.objeto, modal: p.modalidade||"", modalAbrev: mAbrev,
            req: p.setor_requisitante||"", emailR: p.email_requisitante||"", suap: p.link_suap||"", d0_iso: toIso(p.d0),
            execucao: execucao, status: st, retornoFila: false, motivoFila: "",
            servidor: srvInt, servidorExt: srvExt, etapaAtualIdx: etapaAtualIdx,
            etapas: etCalc, ordemFila: (p.ordem_fila!=null?p.ordem_fila:null)
          };
        });
        var ORD = { atrasado:0, aguardando:1, paralisado:2, retornado:3, andamento:4, planejamento:5, ok:6 };
        procs.sort(function(a,b){ return (ORD[a.status]!=null?ORD[a.status]:6)-(ORD[b.status]!=null?ORD[b.status]:6); });
        return { processos: procs, filaPrevisao: [], ordemFilaDisponivel: false, calendario: { feriados:{}, municipio:"", modo:"corridos" } };
      });
  }

  // ---- dispatcher dos métodos appsel.call ----
  function dispatchCall(sb, method, args){
    switch(method){
      case "getEtapasParaApp": return montarEtapasApp(sb);
      case "validarSessaoApp":
        return sb.auth.getUser().then(function(r){ return r.data && r.data.user ? sessaoPayload(sb, r.data.user) : { ok:false, erro:"Sessão expirada." }; });
      case "logoutApp": return sb.auth.signOut().then(function(){ return { ok:true }; });
      case "getServidoresApp": return Promise.resolve({ ok:true, servidores: [] });
      case "getCapacidadeApp": return Promise.resolve({ ok:true, capacidade: [] });
      case "getHistorico": return Promise.resolve({ ok:true, historico: [] });
      case "getAlertasApp": return Promise.resolve({ ok:true, alertas: [] });
      case "getEmails": return Promise.resolve({ ok:true, emails: [] });
      case "lerSrpProcessoApp": return Promise.resolve({ ok:true });
      default:
        // gravações: ainda em construção (próxima fatia)
        return Promise.resolve({ ok:false, erro:"Ação ainda não disponível na versão Supabase (em construção): "+method, __pendente:true });
    }
  }

  // ---- roteamento de uma requisição interceptada ----
  function handle(paramsObj){
    return sbReady.then(function(sb){
      var route = paramsObj.route || "";
      if (route === "appsel.challenge"){
        return Promise.resolve({ ok:true, challengeId:"sb", nonce:"sb", salt:"sb" });
      }
      if (route === "appsel.loginProof"){
        if (!cred.email || !cred.senha) return { ok:false, erro:"Informe e-mail e senha." };
        return sb.auth.signInWithPassword({ email: cred.email, password: cred.senha }).then(function(r){
          if (r.error || !r.data || !r.data.user) return { ok:false, erro:"E-mail ou senha inválidos." };
          return sessaoPayload(sb, r.data.user);
        });
      }
      if (route === "appsel.changePasswordHash"){
        return Promise.resolve({ ok:true }); // troca de senha: via Supabase futuramente
      }
      if (route === "appsel.call"){
        var method = paramsObj.method || "";
        var args = []; try { args = JSON.parse(paramsObj.args||"[]"); } catch(e){}
        return dispatchCall(sb, method, args);
      }
      return Promise.resolve({ ok:false, erro:"Rota não encontrada." });
    }).catch(function(e){ return { ok:false, erro:String(e && e.message || e) }; });
  }

  function parseParams(urlStr){
    var out = {};
    try {
      var q = urlStr.indexOf("?")>=0 ? urlStr.slice(urlStr.indexOf("?")+1) : "";
      q.split("&").forEach(function(kv){ if(!kv) return; var i=kv.indexOf("="); var k=decodeURIComponent(i<0?kv:kv.slice(0,i)); var v=i<0?"":decodeURIComponent(kv.slice(i+1).split("+").join(" ")); out[k]=v; });
    } catch(e){}
    return out;
  }
  function isApi(u){ return SENTINEL_LIST.some(function(s){ return u.indexOf(s)>=0; }); }

  // ---- intercepta fetch ----
  var _fetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function(url){
    try{
      var u = (typeof url==="string") ? url : (url && url.url) || "";
      if (isApi(u)){
        var params = parseParams(u);
        return handle(params).then(function(payload){
          var cb = params.callback || params.cb;
          var body = cb ? (cb+"("+JSON.stringify(payload)+");") : JSON.stringify(payload);
          return new Response(body, { status:200, headers:{ "Content-Type": cb?"application/javascript":"application/json" } });
        });
      }
    }catch(e){}
    return _fetch ? _fetch.apply(this, arguments) : Promise.reject(new Error("no fetch"));
  };

  // ---- intercepta JSONP (<script src=apiUrl?...&callback=cb>) ----
  function jsonpHook(node){
    try{
      if (node && node.tagName==="SCRIPT" && node.src && isApi(node.src)){
        var params = parseParams(node.src);
        var cb = params.callback || params.cb;
        handle(params).then(function(payload){
          var fn = cb ? cb.split(".").reduce(function(o,k){return o?o[k]:undefined;}, window) : null;
          if (typeof fn==="function") fn(payload);
          if (typeof node.onload==="function") node.onload();
        });
        return true;
      }
    }catch(e){}
    return false;
  }
  var _append = Node.prototype.appendChild;
  Node.prototype.appendChild = function(n){ if(jsonpHook(n)) return n; return _append.call(this,n); };
  var _insert = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function(n,r){ if(jsonpHook(n)) return n; return _insert.call(this,n,r); };
})()