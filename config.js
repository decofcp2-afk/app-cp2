/* ============================================================================
   config.js — ADAPTADOR SUPABASE do APP de Gestao (replica fiel)
   Mantem o index.html intocado. Intercepta as chamadas RPC (route=appsel.*)
   e as roteia para o Supabase. Login via Supabase Auth (e-mail @cp2.g12.br).
   1a fatia: login + leitura (getEtapasParaApp). Gravacoes: stubs (em construcao).
   ============================================================================ */
(function () {
  var SB_URL = "https://fhgqixzufmgebwfffdai.supabase.co";
  var SB_KEY = "sb_publishable_O_m4yrige70t94drd8NGrQ_In80Vn32";
  var SCHEMA = "contratacoes";
  var DOMINIO = "@cp2.g12.br";
  var SENTINEL_LIST = ["script.google.com", "/macros/", "supabase-adapter.local"];

  window.APPSEL_CONFIG = {
    apiUrl: "https://supabase-adapter.local/appsel",
    municipioCalendario: "Rio de Janeiro",
    apiTimeoutMs: 30000,
    painelUrl: "https://decofcp2-afk.github.io/painel-cp2/"
  };

  var sbReady = new Promise(function (resolve) {
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s.onload = function () { resolve(window.supabase.createClient(SB_URL, SB_KEY, { db: { schema: SCHEMA }, auth: { persistSession: true, autoRefreshToken: true } })); };
    document.head.appendChild(s);
  });
  function db(sb){ return sb.schema(SCHEMA); }

  var cred = { email: "", senha: "" };
  function normEmail(v){ v=String(v||"").trim(); if(!v) return ""; return v.indexOf("@")>=0 ? v : (v + DOMINIO); }
  document.addEventListener("input", function (ev) {
    var t = ev.target;
    if (!t || !t.id) return;
    if (t.id === "login-matricula") cred.email = normEmail(t.value);
    if (t.id === "login-senha") cred.senha = t.value;
  }, true);
  function ajustarLabelLogin(){
    var f = document.getElementById("login-matricula");
    if (f){ f.placeholder = "E-mail (@cp2.g12.br)"; f.type = "text"; f.autocomplete = "username"; }
  }
  document.addEventListener("DOMContentLoaded", ajustarLabelLogin);
  setTimeout(ajustarLabelLogin, 400); setTimeout(ajustarLabelLogin, 1200);

  function parseISO(s){ if(!s) return null; var p=String(s).slice(0,10).split("-"); if(p.length<3) return null; var d=new Date(+p[0],+p[1]-1,+p[2]); return isNaN(d)?null:d; }
  function toIso(s){ var d=parseISO(s); if(!d) return null; return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  function daysBetween(a,b){ var x=parseISO(a),y=parseISO(b); if(!x||!y) return 0; return Math.round((y-x)/86400000); }
  function stEtapa(s){ s=String(s||"").trim().toLowerCase(); if(s==="naoaplica"||s==="na") return "na"; return s||"planejamento"; }

  function getProfile(sb){
    return db(sb).from("usuario").select("id,nome,matricula,email,papel,unidade_id,cor_avatar").maybeSingle().then(function(r){ return r.data; });
  }
  function matKey(u){ return (u && (u.matricula || u.email)) || ""; }
  function loadServidores(sb){
    return db(sb).from("usuario").select("nome,matricula,email,papel,cor_avatar,ativo").then(function(r){
      var rows = (r.data || []).filter(function(u){ return u.ativo !== false; });
      return rows.map(function(u){
        return { nome: u.nome || u.email, matricula: matKey(u), cor: u.cor_avatar || "#64748b", isChefe: u.papel === "chefia" || u.papel === "admin" };
      });
    }).catch(function(){ return []; });
  }
  function sessaoPayload(sb, user){
    return Promise.all([getProfile(sb), loadServidores(sb)]).then(function(res){
      var prof = res[0], servidores = res[1];
      var papel = prof ? prof.papel : "servidor";
      var mat = (prof && matKey(prof)) || (user && user.email) || "";
      if (mat && !servidores.some(function(s){ return s.matricula === mat; })){
        servidores.push({ nome: (prof&&prof.nome)||(user&&user.email)||"Usuario", matricula: mat, cor: (prof&&prof.cor_avatar)||"#64748b", isChefe: papel==="chefia"||papel==="admin" });
      }
      return {
        ok: true, token: "sb-session", exp: Date.now() + 8*3600*1000,
        nome: (prof && prof.nome) || (user && user.email) || "Usuario",
        matricula: mat, isChefe: papel === "chefia" || papel === "admin",
        mustChange: false, servidores: servidores
      };
    });
  }

  function montarEtapasApp(sb){
    return db(sb).from("processo")
      .select("id,num_suap,objeto,modalidade,d0,tem_irp,link_suap,status,setor_requisitante,email_requisitante,ordem_fila,etapa(id,prazo:prazo_dias,nome,agente:agente_responsavel,fase,status_etapa,motivo:motivo_atraso,prazo_ini,prazo_fim,data_realizacao,ordem)")
      .order("num_suap")
      .then(function(rp){
        var procs = []; var filaArr = [];
        (rp.data || []).forEach(function(p){
          if (!p.d0){
            var etsF = (p.etapa||[]).slice().sort(function(a,b){return (a.ordem||0)-(b.ordem||0);});
            filaArr.push({
              id: p.id, num: p.num_suap||p.id, nome: p.objeto, modal: p.modalidade||"",
              req: p.setor_requisitante||"", suap: p.link_suap||"#",
              etapasPrazos: etsF.map(function(e){ return { nome:e.nome, prazo:e.prazo||0, fase:e.fase||"", status:stEtapa(e.status_etapa) }; }),
              servidor: "", servidorExt: "", ordemFila: (p.ordem_fila!=null?p.ordem_fila:null)
            });
            return;
          }
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
              linha: e.id, prazo: e.prazo||0, nome: e.nome, agente: e.agente||"", fase: e.fase||"",
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
          procs.push({
            id: p.id, num: p.num_suap||p.id, nome: p.objeto, modal: p.modalidade||"", modalAbrev: mAbrev,
            req: p.setor_requisitante||"", emailR: p.email_requisitante||"", suap: p.link_suap||"", d0_iso: toIso(p.d0),
            execucao: execucao, status: st, retornoFila: false, motivoFila: "",
            servidor: srvInt, servidorExt: srvExt, etapaAtualIdx: etapaAtualIdx,
            etapas: etCalc, ordemFila: (p.ordem_fila!=null?p.ordem_fila:null)
          });
        });
        var ORD = { atrasado:0, aguardando:1, paralisado:2, retornado:3, andamento:4, planejamento:5, ok:6 };
        procs.sort(function(a,b){ return (ORD[a.status]!=null?ORD[a.status]:6)-(ORD[b.status]!=null?ORD[b.status]:6); });
        return { processos: procs, filaPrevisao: filaArr, ordemFilaDisponivel: false, calendario: { feriados:{}, municipio:"", modo:"corridos" } };
      });
  }

  function okErr(promise, extra){
    return promise.then(function(r){ if(r && r.error) return { ok:false, erro:r.error.message }; var o={ok:true}; if(extra) for(var k in extra) o[k]=extra[k]; return o; });
  }
  function pickProcId(p){ return p.processoId || p.pid || p.id || p.processo_id; }
  function pickEtapaId(p){ return p.linhaEtapa || p.etapaId || p.linha || p.id; }
  function val(){ for(var i=0;i<arguments.length;i++){ if(arguments[i]!==undefined && arguments[i]!==null) return arguments[i]; } return undefined; }
  function statusStore(s){ s=String(s||"").trim().toLowerCase(); if(s==="na"||s==="nao se aplica"||s==="naoaplica") return "naoaplica"; if(s==="concluida"||s==="concluída") return "ok"; return s; }

  function dispatchCall(sb, method, args){
    var p = (args && args[0]) || {};
    var D = db(sb);
    try{ window.__APPSEL_CALLS = window.__APPSEL_CALLS || []; window.__APPSEL_CALLS.push({ m:method, keys:Object.keys(p) }); if(window.__APPSEL_CALLS.length>40) window.__APPSEL_CALLS.shift(); }catch(e){}

    switch(method){
      case "getEtapasParaApp": return montarEtapasApp(sb);
      case "validarSessaoApp":
        return sb.auth.getUser().then(function(r){ return r.data && r.data.user ? sessaoPayload(sb, r.data.user) : { ok:false, erro:"Sessao expirada." }; });
      case "logoutApp": return sb.auth.signOut().then(function(){ return { ok:true }; });
      case "getServidoresApp": return loadServidores(sb).then(function(s){ return { ok:true, servidores: s }; });
      case "getCapacidadeApp": return Promise.resolve({ ok:true, capacidade: [] });
      case "getHistorico": return Promise.resolve({ ok:true, historico: [] });
      case "getAlertasApp": return Promise.resolve({ ok:true, alertas: [] });
      case "getEmails": return Promise.resolve({ ok:true, emails: [] });
      case "lerSrpProcessoApp":
        return D.from("processo").select("tem_irp").eq("id", pickProcId(p)).maybeSingle().then(function(r){ return { ok:true, temIRP: !!(r.data && r.data.tem_irp), srp: !!(r.data && r.data.tem_irp) }; });

      case "concluirEtapa": {
        if(!p.dataRealizacao) return Promise.resolve({ ok:false, erro:"Informe a data de conclusao da etapa antes de concluir." });
        var updC = { status_etapa:"ok", data_realizacao: p.dataRealizacao };
        if(p.motivo && String(p.motivo).trim()) updC.motivo_atraso = String(p.motivo).trim();
        var qC = D.from("etapa").update(updC);
        qC = p.linhaEtapa ? qC.eq("id", pickEtapaId(p)) : qC.eq("processo_id", pickProcId(p)).eq("nome", p.nomeEtapa);
        return okErr(qC, { transicaoFase:false, servidorExt:"" });
      }
      case "regredirEtapa":
        return okErr(D.from("etapa").update({ status_etapa:"andamento", data_realizacao:null, motivo_atraso:null }).eq("id", pickEtapaId(p)));
      case "atualizarStatusEtapa":
        return okErr(D.from("etapa").update({ status_etapa: statusStore(val(p.status,p.novoStatus,p.statusEtapa,p.valor)) }).eq("id", pickEtapaId(p)));
      case "atribuirResponsaveisApp":
        return okErr(D.from("etapa").update({ agente_responsavel: val(p.servidor,p.agente,p.responsavel,p.valor) }).eq("id", pickEtapaId(p)));

      case "salvarNumeroProcessoApp":
        return okErr(D.from("processo").update({ num_suap: val(p.numero,p.num,p.numeroProcesso,p.valor) }).eq("id", pickProcId(p)));
      case "salvarLinkSuapProcessoApp":
        return okErr(D.from("processo").update({ link_suap: val(p.link,p.linkSuap,p.url,p.valor) }).eq("id", pickProcId(p)));
      case "salvarNomeProcessoFilaApp":
        return okErr(D.from("processo").update({ objeto: val(p.nome,p.objeto,p.valor) }).eq("id", pickProcId(p)));
      case "salvarOrdemFilaApp": {
        var lst = p.ordens || p.lista;
        if(Array.isArray(lst)){
          return Promise.all(lst.map(function(it,ix){ return D.from("processo").update({ ordem_fila: (it.ordem!=null?it.ordem:ix) }).eq("id", it.id||it.processoId); })).then(function(){ return { ok:true }; });
        }
        var ord = val(p.ordem, p.ordemFila, p.valor);
        return okErr(D.from("processo").update({ ordem_fila: (ord!=null?ord:null) }).eq("id", pickProcId(p)));
      }
      case "salvarSrpProcessoApp": {
        var srp = !!val(p.srp, p.temSrp, p.tem_irp, p.temIRP, p.valor);
        return D.from("processo").update({ tem_irp: srp }).eq("id", pickProcId(p)).then(function(r){
          if(r.error) return { ok:false, erro:r.error.message };
          return D.from("etapa").update({ status_etapa: srp ? "planejamento" : "naoaplica" }).eq("processo_id", pickProcId(p)).ilike("nome","%IRP%").then(function(){ return { ok:true, temIRP: srp }; });
        });
      }
      case "devolverProcessoFilaApp":
        return okErr(D.from("processo").update({ d0:null }).eq("id", pickProcId(p)));
      case "excluirProcessoApp":
        return D.from("etapa").delete().eq("processo_id", pickProcId(p)).then(function(){
          return D.from("processo").delete().eq("id", pickProcId(p)).then(function(r){ return r.error?{ok:false,erro:r.error.message}:{ok:true}; });
        });

      default:
        return Promise.resolve({ ok:false, erro:"Acao ainda nao disponivel na versao Supabase (em construcao): "+method, __pendente:true });
    }
  }

  function handle(paramsObj){
    return sbReady.then(function(sb){
      var route = paramsObj.route || "";
      if (route === "appsel.challenge"){
        return Promise.resolve({ ok:true, challengeId:"sb", nonce:"sb", salt:"sb" });
      }
      if (route === "appsel.loginProof"){
        if (!cred.email || !cred.senha) return { ok:false, erro:"Informe e-mail e senha." };
        return sb.auth.signInWithPassword({ email: cred.email, password: cred.senha }).then(function(r){
          if (r.error || !r.data || !r.data.user) return { ok:false, erro:"E-mail ou senha invalidos." };
          return sessaoPayload(sb, r.data.user);
        });
      }
      if (route === "appsel.changePasswordHash"){
        return Promise.resolve({ ok:true });
      }
      if (route === "appsel.call"){
        var method = paramsObj.method || "";
        var args = []; try { args = JSON.parse(paramsObj.args||"[]"); } catch(e){}
        return dispatchCall(sb, method, args);
      }
      return Promise.resolve({ ok:false, erro:"Rota nao encontrada." });
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
})();
