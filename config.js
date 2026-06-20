/* ============================================================================
   config.js — ADAPTADOR SUPABASE do APP de Gestao (replica fiel)
   Mantem o index.html intocado. Intercepta as chamadas RPC (route=appsel.*)
   e as roteia para o Supabase. Login via Supabase Auth (e-mail @cp2.g12.br).
   Multi-unidade com RLS + painel de Administracao injetado.
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
  function isoD(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  var UNIDADE_FALLBACK = "aa2f74ab-86f7-453d-b9e2-e1399e9c26ac";
  var TEMPLATE_ETAPAS = [
    { nome:"Designação da equipe", fase:"interna", ordem:0, prazo:50 },
    { nome:"ETP + Mapa de Riscos + Pesquisa de Preços", fase:"interna", ordem:1, prazo:10 },
    { nome:"Minuta do Termo de Referência", fase:"interna", ordem:2, prazo:11 },
    { nome:"IRP — Intenção de Registro de Preços", fase:"interna", ordem:3, prazo:15 },
    { nome:"Adequações finais dos documentos e envio à Procuradoria", fase:"interna", ordem:4, prazo:20 },
    { nome:"Versão final do TR e demais documentos aprovados", fase:"interna", ordem:5, prazo:10 },
    { nome:"Envio ao SEL/SEPMA (Recebimento de processo, cadastro e publicação da licitação)", fase:"interna", ordem:6, prazo:30 },
    { nome:"Fase externa — Pregão Eletrônico", fase:"externa", ordem:7, prazo:60 }
  ];

  function getProfile(sb){
    return sb.auth.getUser().then(function(rr){
      var u = rr.data && rr.data.user;
      if(!u) return null;
      return db(sb).from("usuario").select("id,nome,matricula,email,papel,unidade_id,cor_avatar").eq("id", u.id).maybeSingle().then(function(r){ return r.data || null; });
    }).catch(function(){ return null; });
  }
  function matKey(u){ return (u && (u.matricula || u.email)) || ""; }
  function loadServidores(sb){
    // equipe da unidade = usuarios (RLS escopa para a unidade do logado; admin ve todos)
    return db(sb).from("usuario").select("nome,matricula,email,papel,cor_avatar,ativo").then(function(r){
      var rows = (r.data || []).filter(function(u){ return u.ativo !== false; });
      return rows.map(function(u){
        return { nome: u.nome || u.email, matricula: u.matricula || u.email || u.nome, cor: u.cor_avatar || "#64748b", isChefe: (u.papel==="chefia"||u.papel==="admin") };
      });
    }).catch(function(){ return []; });
  }
  function sessaoPayload(sb, user){
    return Promise.all([getProfile(sb), loadServidores(sb)]).then(function(res){
      var prof = res[0], servidores = res[1];
      var papel = prof ? prof.papel : "servidor";
      var operacional = !!prof; // todos com perfil (servidor/chefe/admin) operam a Fila/Etapas da sua unidade
      var mat = (prof && matKey(prof)) || (user && user.email) || "";
      var minha = null;
      for (var iSrv=0; iSrv<servidores.length; iSrv++){ if (servidores[iSrv].matricula === mat){ minha = servidores[iSrv]; break; } }
      if (minha){ minha.isChefe = operacional; } // a própria entrada vê Fila/+ (operacional), independentemente do papel
      else if (mat){
        servidores.push({ nome: (prof&&prof.nome)||(user&&user.email)||"Usuario", matricula: mat, cor: (prof&&prof.cor_avatar)||"#64748b", isChefe: operacional });
      }
      return {
        ok: true, token: "sb-session", exp: Date.now() + 8*3600*1000,
        nome: (prof && prof.nome) || (user && user.email) || "Usuario",
        matricula: mat, isChefe: operacional,
        papel: papel, mustChange: false, servidores: servidores
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

  // ── Capacidade do Setor (réplica do getCapacidadeApp) ──────────────────
  function capNormSrv(s){ return String(s||"").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,""); }
  function capTitle(s){ s=String(s||"").trim(); return s ? s.charAt(0).toUpperCase()+s.slice(1).toLowerCase() : ""; }
  function capRound1(n){ return Math.round((n||0)*10)/10; }
  function capNormStatus(s){
    var n = String(s||"").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
    if(n.indexOf("conclu")>=0 || n==="ok") return "ok";
    if(n==="naoaplica" || n==="na" || n.indexOf("nao se aplica")>=0) return "na";
    if(n.indexOf("andament")>=0) return "andamento";
    if(n.indexOf("aguard")>=0) return "aguardando";
    if(n.indexOf("paralis")>=0 || n.indexOf("suspens")>=0) return "paralisado";
    if(n.indexOf("atras")>=0) return "atrasado";
    return "pendente"; // planejamento/pendente/vazio
  }
  function capRecalc(resumo, registros){
    var soma={}, fut={}, futQ={};
    registros.forEach(function(r){
      if(r.concluido) return;
      var k = capNormSrv(r.servidor);
      if(r.ativo==="Sim"){ soma[k]=(soma[k]||0)+r.total; }
      else { fut[k]=(fut[k]||0)+r.total; futQ[k]=(futQ[k]||0)+1; }
    });
    resumo.forEach(function(s){
      var k = capNormSrv(s.servidor);
      var pr = soma[k]||0, fu = fut[k]||0;
      s.processos = capRound1(pr);
      s.total = capRound1(s.processos + s.outros);
      s.pct = s.teto ? capRound1(s.total/s.teto*100) : 0;
      s.status = s.pct>=90 ? "Crítico" : (s.pct>=60 ? "Atenção" : "Disponível");
      s.futuros = capRound1(fu);
      s.futurosQtd = futQ[k]||0;
      s.projetado = capRound1(s.total + s.futuros);
      s.pctProjetado = s.teto ? capRound1(s.projetado/s.teto*100) : 0;
    });
  }
  function capacidadeApp(sb){
    return getProfile(sb).then(function(prof){
      var unidadeId = (prof && prof.unidade_id) || UNIDADE_FALLBACK;
      return Promise.all([
        db(sb).from("capacidade_carga").select("id,processo_id,servidor,fase,pts_mod,pts_nat,pts_sess,processo(objeto,modalidade,num_suap,email_requisitante)").eq("unidade_id", unidadeId),
        db(sb).from("capacidade_outros").select("servidor,fase,outros").eq("unidade_id", unidadeId),
        db(sb).from("etapa").select("processo_id,fase,status_etapa").eq("unidade_id", unidadeId),
        db(sb).from("usuario").select("nome,papel,ativo").eq("unidade_id", unidadeId)
      ]).then(function(res){
        var cargas = (res[0].data)||[], outros = (res[1].data)||[], etapas = (res[2].data)||[], usuarios = (res[3].data)||[];
        // status por processo
        var acc = {};
        etapas.forEach(function(e){
          var pid = e.processo_id; if(!pid) return;
          var st = capNormStatus(e.status_etapa); if(st==="na") return;
          var fk = String(e.fase||"").toLowerCase().indexOf("ext")>=0 ? "ext" : "int";
          if(!acc[pid]) acc[pid] = { total:0, ok:0, ativa:"", primeiraPend:"", primeiraPendPosOk:"", iniciado:false };
          var a = acc[pid]; a.total++;
          if(st==="ok"){ a.ok++; a.iniciado=true; }
          else if(["andamento","aguardando","paralisado","atrasado"].indexOf(st)>=0){ if(!a.ativa) a.ativa=fk; a.iniciado=true; }
          else if(st==="pendente"){ if(!a.primeiraPend) a.primeiraPend=fk; if(a.ok>0 && !a.primeiraPendPosOk) a.primeiraPendPosOk=fk; }
        });
        var concluido={}, faseCorrente={}, iniciado={};
        Object.keys(acc).forEach(function(pid){
          var a = acc[pid];
          concluido[pid] = a.total>0 && a.ok>=a.total;
          faseCorrente[pid] = a.ativa || a.primeiraPendPosOk || a.primeiraPend || "";
          iniciado[pid] = a.iniciado;
        });
        // outros por servidor+fase
        var outrosMap = {};
        outros.forEach(function(o){ outrosMap[capNormSrv(o.servidor)+"|"+(String(o.fase||"int").toLowerCase().indexOf("ext")>=0?"ext":"int")] = Number(o.outros)||0; });
        // registros
        var registrosInt=[], registrosExt=[];
        cargas.forEach(function(c){
          var pid = c.processo_id;
          if(concluido[pid]) return;
          var fk = String(c.fase||"").toLowerCase().indexOf("ext")>=0 ? "ext" : "int";
          if(faseCorrente[pid]==="ext" && fk==="int") return; // esconde interna depois que externa assumiu
          var ativo;
          if(concluido[pid]) ativo="Não";
          else if(fk==="ext") ativo = faseCorrente[pid]==="ext" ? "Sim" : "Não";
          else ativo = (faseCorrente[pid]==="int" && iniciado[pid]) ? "Sim" : "Não";
          var pr = c.processo||{};
          var p11=Number(c.pts_mod)||0, p12=Number(c.pts_nat)||0, p23=Number(c.pts_sess)||0;
          var rec = {
            linha: c.id, pid: pr.num_suap || c.processo_id, servidor: capTitle(c.servidor||""),
            objeto: pr.objeto||"", modal: pr.modalidade||"", fase: c.fase, ativo: ativo,
            pts11: p11, pts12: p12, pts23: p23, total: capRound1(p11+p12+p23),
            emailR: pr.email_requisitante||"", concluido: false
          };
          if(fk==="ext") registrosExt.push(rec); else registrosInt.push(rec);
        });
        // resumo por servidor da unidade
        function buildResumo(faseKey){
          return usuarios.filter(function(u){ return u.ativo!==false; }).map(function(u){
            return {
              servidor: u.nome, outros: outrosMap[capNormSrv(u.nome)+"|"+faseKey]||0,
              linhaSum: "", colOutros: faseKey==="int"?2:11, total:0, teto: faseKey==="int"?10:6,
              pct:0, status:"Disponível", futuros:0, futurosQtd:0, projetado:0, pctProjetado:0
            };
          });
        }
        var resumoInt = buildResumo("int"), resumoExt = buildResumo("ext");
        capRecalc(resumoInt, registrosInt);
        capRecalc(resumoExt, registrosExt);
        return { ok:true, resumoInt: resumoInt, resumoExt: resumoExt, registrosInt: registrosInt, registrosExt: registrosExt };
      });
    }).catch(function(e){ return { ok:false, erro: String(e && e.message || e), resumoInt:[], resumoExt:[], registrosInt:[], registrosExt:[] }; });
  }
  function capRequireChefe(sb){
    return getProfile(sb).then(function(prof){
      if(!prof || (prof.papel!=="chefia" && prof.papel!=="admin")) return { __block: { ok:false, erro:"Ação restrita à chefia." }, prof:null };
      return { __block:null, prof:prof };
    });
  }

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
      case "getCapacidadeApp": return capacidadeApp(sb);
      case "salvarPontuacaoCap":
        return capRequireChefe(sb).then(function(g){ if(g.__block) return g.__block;
          return okErr(D.from("capacidade_carga").update({ pts_mod: Number(val(p.pts11,p.pts_mod,0))||0, pts_nat: Number(val(p.pts12,p.pts_nat,0))||0, pts_sess: Number(val(p.pts23,p.pts_sess,0))||0 }).eq("id", val(p.linha,p.cargaId,p.id))); });
      case "salvarOutrosCap":
        return capRequireChefe(sb).then(function(g){ if(g.__block) return g.__block;
          var serv = val(p.servidor); if(!serv) return { ok:false, erro:"Servidor não informado." };
          var faseK = String(val(p.fase,"int")).toLowerCase().indexOf("ext")>=0 ? "ext" : "int";
          var valor = Number(val(p.valor,p.outros,0))||0;
          return okErr(D.from("capacidade_outros").upsert({ unidade_id: g.prof.unidade_id, servidor: serv, fase: faseK, outros: valor }, { onConflict:"unidade_id,servidor,fase" })); });
      case "getHistorico": return Promise.resolve({ ok:true, historico: [] });
      case "getAlertasApp": return Promise.resolve({ ok:true, alertas: [] });
      case "getEmails":
        return D.from("usuario").select("nome,matricula,email").then(function(r){ return { ok:true, emails:(r.data||[]).map(function(s){ return { servidor:s.nome, nome:s.nome, matricula:s.matricula||s.email, email:s.email||"" }; }) }; });
      case "salvarEmail": {
        var alvoE = val(p.servidor, p.nome, p.matricula, p.id) || "";
        var emE = val(p.email, p.emailServidor, p.valor); if(emE===undefined) emE=null;
        return Promise.all([
          D.from("usuario").update({ email: emE }).eq("nome", alvoE),
          D.from("usuario").update({ email: emE }).eq("matricula", alvoE),
          D.from("usuario").update({ email: emE }).eq("email", alvoE)
        ]).then(function(){ return { ok:true }; });
      }
      case "salvarEmailProcesso":
        return okErr(D.from("processo").update({ email_requisitante: val(p.email,p.emailReq,p.valor) }).eq("id", pickProcId(p)));
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
      case "atribuirResponsaveisApp": {
        if(p.servInt!==undefined || p.servExt!==undefined){
          return capRequireChefe(sb).then(function(g){ if(g.__block) return g.__block;
            var pid2 = pickProcId(p); var si = val(p.servInt)||""; var se = val(p.servExt)||"";
            var mN = String(p.modal||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,""); var ehPE = mN.indexOf("preg")>=0||mN.indexOf("concorr")>=0;
            if(ehPE && si && se && si===se) return { ok:false, erro:"Fase interna e externa precisam de responsaveis diferentes em Pregao/Concorrencia." };
            var ops = [
              D.from("capacidade_carga").update({ servidor: si }).eq("processo_id", pid2).neq("fase","Externa"),
              D.from("etapa").update({ agente_responsavel: si }).eq("processo_id", pid2).not("fase","ilike","%ext%")
            ];
            ops.push(D.from("capacidade_carga").update({ servidor: ehPE? se : (se||si) }).eq("processo_id", pid2).eq("fase","Externa"));
            ops.push(D.from("etapa").update({ agente_responsavel: ehPE? se : (se||si) }).eq("processo_id", pid2).ilike("fase","%ext%"));
            return Promise.all(ops).then(function(){ return { ok:true, avisos: [] }; });
          });
        }
        return okErr(D.from("etapa").update({ agente_responsavel: val(p.servidor,p.agente,p.responsavel,p.valor) }).eq("id", pickEtapaId(p)));
      }

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

      case "salvarServidoresApp": {
        var lista = p.servidores || (Array.isArray(args[0]) ? args[0] : []);
        if(!Array.isArray(lista)) lista = [];
        return getProfile(sb).then(function(prof){
          var unidadeId = (prof && prof.unidade_id) || UNIDADE_FALLBACK;
          return D.from("servidor").delete().eq("unidade_id", unidadeId).then(function(){
            if(!lista.length) return { ok:true, servidores:[] };
            var rows = lista.map(function(s){ return { nome:s.nome, matricula: s.matricula||s.email||s.nome, email:s.email||null, cor:s.cor||"#64748b", is_chefe: !!(s.isChefe||s.is_chefe), ativo: s.ativo!==false, unidade_id: unidadeId }; });
            return D.from("servidor").insert(rows).then(function(r){ return r.error?{ok:false,erro:r.error.message}:{ok:true, servidores:lista}; });
          });
        });
      }

      case "iniciarProcessos": {
        var items = Array.isArray(args[0]) ? args[0] : (Array.isArray(p)?p:[p]);
        var ops = items.map(function(item){
          var modal = String(item.modal||"").toLowerCase();
          var seg = (modal.indexOf("preg")>=0 || modal.indexOf("concorr")>=0);
          if(seg && item.servidor && item.servidorExt && item.servidor===item.servidorExt){
            return Promise.reject(new Error("Fase interna e fase externa precisam ter responsaveis diferentes em Pregao/Concorrencia."));
          }
          return D.from("processo").update({ d0: item.d0, status:"andamento" }).eq("id", item.pid).then(function(){
            return D.from("etapa").select("id,nome,fase,status_etapa,ordem").eq("processo_id", item.pid).order("ordem").then(function(re){
              var ets = re.data || [];
              var ups = ets.map(function(e){
                var isExt = String(e.fase||"").toLowerCase().indexOf("ext")>=0;
                var agente = isExt ? (seg ? (item.servidorExt||"") : (item.servidorExt||item.servidor||"")) : (item.servidor||"");
                return D.from("etapa").update({ agente_responsavel: agente }).eq("id", e.id);
              });
              var primeira = null;
              for(var k=0;k<ets.length;k++){ var st=stEtapa(ets[k].status_etapa); var nm=String(ets[k].nome||"").toLowerCase(); var contr = nm.indexOf("assinatura")>=0||nm.indexOf("arp")>=0; if(st!=="ok"&&st!=="na"&&!contr){ primeira=ets[k]; break; } }
              if(primeira) ups.push(D.from("etapa").update({ status_etapa:"andamento", motivo_atraso:null, data_realizacao:null }).eq("id", primeira.id));
              return Promise.all(ups);
            });
          });
        });
        return Promise.all(ops).then(function(){ return { ok:true, iniciados: items.length }; }).catch(function(e){ return { ok:false, erro:String(e&&e.message||e) }; });
      }

      case "cadastrarProcesso": {
        var objeto = val(p.objeto, p.nome) || "";
        var modalidade = val(p.modalidade, p.modal) || "PE";
        var d0 = null; // cadastro sempre entra na FILA; a data de inicio (d0) e definida ao "iniciar"
        var nro = val(p.nroSuap, p.numSuap, p.numero, p.num) || "";
        var srpC = !!val(p.temIRP, p.srp, p.temSrp);
        var setor = val(p.setor, p.setorRequisitante, p.req) || "";
        var emailReq = val(p.emailReq, p.emailRequisitante) || "";
        var linkS = val(p.linkSuap, p.link) || "";
        var rInt = val(p.respInterno, p.servidor, p.servidorInterno) || "";
        var rExt = val(p.respExterno, p.servidorExterno) || rInt;
        var mLow = String(modalidade).toLowerCase();
        var segC = (mLow.indexOf("preg")>=0 || mLow.indexOf("concorr")>=0);
        if(segC && rInt && rExt && rInt===rExt) return Promise.resolve({ ok:false, erro:"Fase interna e externa precisam de responsaveis diferentes em Pregao/Concorrencia." });
        return getProfile(sb).then(function(prof){
          var unidadeId = (prof && prof.unidade_id) || UNIDADE_FALLBACK;
          return D.from("processo").insert({
            unidade_id: unidadeId, num_suap: nro, objeto: objeto, modalidade: modalidade,
            d0: d0, tem_irp: srpC, setor_requisitante: setor, email_requisitante: emailReq,
            link_suap: linkS, status: d0 ? "andamento" : "planejamento", publicado: true
          }).select("id").maybeSingle().then(function(rins){
            if(rins.error || !rins.data) return { ok:false, erro:(rins.error&&rins.error.message)||"Falha ao criar processo." };
            var pid = rins.data.id;
            var cursor = d0 ? parseISO(d0) : null;
            var firstDone = false;
            var rows = TEMPLATE_ETAPAS.map(function(t){
              var isExt = t.fase === "externa";
              var isIRP = /irp/i.test(t.nome);
              var st = "planejamento";
              if(isIRP && !srpC) st = "naoaplica";
              else if(d0 && !firstDone){ st = "andamento"; firstDone = true; }
              var iniIso=null, fimIso=null;
              if(cursor){
                iniIso = isoD(cursor);
                var fim = new Date(cursor.getTime()); fim.setDate(fim.getDate() + (t.prazo||0)); fimIso = isoD(fim);
                if(!(isIRP && !srpC)) cursor = new Date(fim.getTime());
              }
              return { processo_id: pid, unidade_id: unidadeId, nome: t.nome, fase: t.fase, ordem: t.ordem, prazo_dias: t.prazo,
                       agente_responsavel: (isExt ? rExt : rInt), status_etapa: st, prazo_ini: iniIso, prazo_fim: fimIso };
            });
            return D.from("etapa").insert(rows).then(function(re){
              if(re.error) return { ok:false, erro:re.error.message };
              var cargasRows = [{ unidade_id: unidadeId, processo_id: pid, servidor: rInt||null, fase: segC?"Interna":"Unica", pts_mod:0, pts_nat:0, pts_sess:0 }];
              if(segC) cargasRows.push({ unidade_id: unidadeId, processo_id: pid, servidor: rExt||null, fase:"Externa", pts_mod:0, pts_nat:0, pts_sess:0 });
              return D.from("capacidade_carga").insert(cargasRows).then(function(){ return { ok:true, processoId: pid }; });
            });
          });
        });
      }

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
        var emailF = cred.email, senhaF = cred.senha;
        try{ var mf=document.getElementById('login-matricula'), sf=document.getElementById('login-senha'); if(mf&&mf.value) emailF=normEmail(mf.value); if(sf&&sf.value) senhaF=sf.value; }catch(eRead){}
        if (!emailF || !senhaF) return { ok:false, erro:"Informe e-mail e senha." };
        return sb.auth.signInWithPassword({ email: emailF, password: senhaF }).then(function(r){
          if (r.error || !r.data || !r.data.user) return { ok:false, erro:"E-mail ou senha invalidos." + (r.error&&r.error.message?(" ("+r.error.message+")"):"") };
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

  // ====================== ADMINISTRAÇÃO (UI injetada) ======================
  function admEl(tag, css, txt){ var e=document.createElement(tag); if(css) e.style.cssText=css; if(txt!=null) e.textContent=txt; return e; }
  function admToast(msg, ok){
    var t=admEl('div','position:fixed;left:50%;bottom:74px;transform:translateX(-50%);z-index:10001;background:'+(ok?'#15803d':'#b91c1c')+';color:#fff;padding:10px 16px;border-radius:8px;font:600 14px system-ui;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:90%;text-align:center;', msg);
    document.body.appendChild(t); setTimeout(function(){ try{t.remove();}catch(e){} }, 4000);
  }
  function admFechar(){ var m=document.getElementById('ovl-admin-cp2'); if(m) m.remove(); }

  function admCriarUsuario(sb, dados){
    var sb2 = window.supabase.createClient(SB_URL, SB_KEY, { auth:{ persistSession:false, autoRefreshToken:false, storageKey:'sb-cp2-tmp' } });
    return sb2.auth.signUp({ email: normEmail(dados.email), password: dados.senha }).then(function(r){
      if(r.error) return { ok:false, erro:r.error.message };
      var uid = r.data && r.data.user && r.data.user.id;
      if(!uid) return { ok:false, erro:'Login nao criado (verifique se "Enable sign ups" esta ativo e "Confirm email" desativado no Supabase Auth).' };
      return db(sb).from('usuario').insert({ id:uid, nome:dados.nome, email:normEmail(dados.email), papel:dados.papel||'servidor', unidade_id:dados.unidade_id, ativo:true }).then(function(ins){
        if(ins.error) return { ok:false, erro:'Login criado, mas falhou o perfil: '+ins.error.message };
        return { ok:true };
      });
    });
  }

  function admAbrir(){
    admFechar();
    sbReady.then(function(sb){
      var D = db(sb);
      Promise.all([ getProfile(sb), D.from('unidade').select('id,sigla,nome').eq('ativa',true).order('nome'), D.from('usuario').select('id,nome,email,papel,unidade_id,ativo').order('nome') ])
      .then(function(res){
        var prof=res[0], unidades=(res[1].data||[]), usuarios=(res[2].data||[]);
        var isAdmin = prof && prof.papel==='admin';
        var ovl = admEl('div','position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:10000;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:28px 12px;');
        ovl.id='ovl-admin-cp2';
        ovl.addEventListener('click', function(ev){ if(ev.target===ovl) admFechar(); });
        var card = admEl('div','background:#fff;max-width:780px;width:100%;border-radius:12px;padding:20px 22px;font:14px system-ui;color:#0f172a;box-shadow:0 10px 40px rgba(0,0,0,.3);');
        var hd = admEl('div','display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;');
        hd.appendChild(admEl('div','font:700 18px system-ui;', isAdmin?'Administração':'Equipe da unidade'));
        var x = admEl('button','border:0;background:#e2e8f0;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:16px;','✕'); x.onclick=admFechar; hd.appendChild(x);
        card.appendChild(hd);

        if(isAdmin){
          card.appendChild(admEl('div','font:700 15px system-ui;margin:6px 0 8px;','Unidades'));
          var addRow = admEl('div','display:flex;gap:6px;margin-bottom:8px;');
          var inSig=admEl('input','flex:0 0 90px;padding:7px;border:1px solid #cbd5e1;border-radius:7px;'); inSig.placeholder='Sigla';
          var inNom=admEl('input','flex:1;padding:7px;border:1px solid #cbd5e1;border-radius:7px;'); inNom.placeholder='Nome da nova unidade';
          var bAdd=admEl('button','background:#1e3a8a;color:#fff;border:0;border-radius:7px;padding:7px 12px;cursor:pointer;','Adicionar');
          bAdd.onclick=function(){ var s=(inSig.value||'').trim().toUpperCase(), n=(inNom.value||'').trim(); if(!s||!n){ admToast('Informe sigla e nome.',false); return; }
            D.from('unidade').insert({ sigla:s, nome:n, tipo:'campus', ativa:true, municipio_calendario:'Rio de Janeiro' }).then(function(r){ if(r.error){ admToast(r.error.message,false);} else { admToast('Unidade criada.',true); admAbrir(); } });
          };
          addRow.appendChild(inSig); addRow.appendChild(inNom); addRow.appendChild(bAdd); card.appendChild(addRow);
          var ulBox=admEl('div','max-height:150px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:16px;');
          unidades.forEach(function(u){ var row=admEl('div','display:flex;gap:6px;align-items:center;padding:6px 8px;border-bottom:1px solid #f1f5f9;');
            row.appendChild(admEl('div','flex:0 0 70px;font-weight:600;', u.sigla));
            var nIn=admEl('input','flex:1;padding:5px;border:1px solid #e2e8f0;border-radius:6px;'); nIn.value=u.nome;
            var sv=admEl('button','background:#e2e8f0;border:0;border-radius:6px;padding:5px 10px;cursor:pointer;','Salvar');
            sv.onclick=function(){ D.from('unidade').update({ nome:(nIn.value||'').trim() }).eq('id',u.id).then(function(r){ admToast(r.error?r.error.message:'Unidade atualizada.', !r.error); }); };
            row.appendChild(nIn); row.appendChild(sv); ulBox.appendChild(row);
          });
          card.appendChild(ulBox);
        }

        card.appendChild(admEl('div','font:700 15px system-ui;margin:6px 0 8px;', 'Novo usuário'+(isAdmin?'':' (sua unidade)')));
        var nu = admEl('div','display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;');
        var uNome=admEl('input','padding:7px;border:1px solid #cbd5e1;border-radius:7px;'); uNome.placeholder='Nome';
        var uMail=admEl('input','padding:7px;border:1px solid #cbd5e1;border-radius:7px;'); uMail.placeholder='E-mail (@cp2.g12.br)';
        var uSenha=admEl('input','padding:7px;border:1px solid #cbd5e1;border-radius:7px;'); uSenha.placeholder='Senha provisória'; uSenha.type='text';
        var uPapel=admEl('select','padding:7px;border:1px solid #cbd5e1;border-radius:7px;');
        ['servidor','chefia'].forEach(function(pp){ var o=admEl('option',null,pp==='servidor'?'Servidor':'Chefe'); o.value=pp; uPapel.appendChild(o); });
        nu.appendChild(uNome); nu.appendChild(uMail); nu.appendChild(uSenha); nu.appendChild(uPapel); card.appendChild(nu);
        var uUni=null;
        if(isAdmin){ uUni=admEl('select','padding:7px;border:1px solid #cbd5e1;border-radius:7px;width:100%;margin-bottom:6px;');
          unidades.forEach(function(u){ var o=admEl('option',null,u.nome); o.value=u.id; uUni.appendChild(o); }); card.appendChild(uUni);
        }
        var bNovo=admEl('button','background:#15803d;color:#fff;border:0;border-radius:7px;padding:9px 14px;cursor:pointer;font-weight:600;width:100%;margin-bottom:18px;','Criar usuário');
        bNovo.onclick=function(){ var nome=(uNome.value||'').trim(), email=(uMail.value||'').trim(), senha=uSenha.value||'';
          if(!nome||!email||!senha){ admToast('Preencha nome, e-mail e senha.',false); return; }
          if(senha.length<6){ admToast('A senha precisa de ao menos 6 caracteres.',false); return; }
          var unidade_id = isAdmin ? (uUni&&uUni.value) : (prof&&prof.unidade_id);
          if(!unidade_id){ admToast('Unidade não definida.',false); return; }
          bNovo.disabled=true; bNovo.textContent='Criando...';
          admCriarUsuario(sb, { nome:nome, email:email, senha:senha, papel:uPapel.value, unidade_id:unidade_id }).then(function(r){
            bNovo.disabled=false; bNovo.textContent='Criar usuário';
            if(r.ok){ admToast('Usuário criado.',true); admAbrir(); } else { admToast(r.erro||'Falha.',false); }
          });
        };
        card.appendChild(bNovo);

        card.appendChild(admEl('div','font:700 15px system-ui;margin:6px 0 8px;', 'Usuários'));
        var box=admEl('div','max-height:240px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;');
        if(!usuarios.length) box.appendChild(admEl('div','padding:10px;color:#64748b;','Nenhum usuário ainda.'));
        usuarios.forEach(function(u){
          var row=admEl('div','display:flex;gap:6px;align-items:center;padding:6px 8px;border-bottom:1px solid #f1f5f9;');
          row.appendChild(admEl('div','flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', (u.nome||u.email)+'  ·  '+(u.email||'')));
          var pSel=admEl('select','padding:4px;border:1px solid #e2e8f0;border-radius:6px;');
          ['servidor','chefia'].concat(isAdmin?['admin']:[]).forEach(function(pp){ var o=admEl('option',null,pp); o.value=pp; if(u.papel===pp)o.selected=true; pSel.appendChild(o); });
          row.appendChild(pSel);
          var uSel=null;
          if(isAdmin){ uSel=admEl('select','padding:4px;border:1px solid #e2e8f0;border-radius:6px;max-width:120px;'); unidades.forEach(function(z){ var o=admEl('option',null,z.sigla); o.value=z.id; if(u.unidade_id===z.id)o.selected=true; uSel.appendChild(o); }); row.appendChild(uSel); }
          var sv=admEl('button','background:#e2e8f0;border:0;border-radius:6px;padding:4px 10px;cursor:pointer;','Salvar');
          sv.onclick=function(){ var upd={ papel:pSel.value }; if(isAdmin&&uSel) upd.unidade_id=uSel.value; D.from('usuario').update(upd).eq('id',u.id).then(function(r){ admToast(r.error?r.error.message:'Atualizado.', !r.error); }); };
          row.appendChild(sv); box.appendChild(row);
        });
        card.appendChild(box);

        ovl.appendChild(card); document.body.appendChild(ovl);
      }).catch(function(e){ admToast('Erro: '+(e&&e.message||e), false); });
    });
  }

  function admInstalarBotao(){
    sbReady.then(function(sb){ return getProfile(sb); }).then(function(p){
      var priv = p && (p.papel==='admin' || p.papel==='chefia');
      var existing = document.getElementById('btn-admin-cp2');
      if(!priv){ if(existing) existing.remove(); var ov=document.getElementById('ovl-admin-cp2'); if(ov) ov.remove(); return; }
      if(existing){ existing.textContent = p.papel==='admin'?'⚙️ Administração':'👥 Equipe'; return; }
      var b=admEl('button','position:fixed;right:18px;bottom:18px;z-index:9998;background:#1e3a8a;color:#fff;border:0;border-radius:24px;padding:10px 16px;font:600 14px system-ui;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25);', p.papel==='admin'?'⚙️ Administração':'👥 Equipe');
      b.id='btn-admin-cp2'; b.onclick=admAbrir; document.body.appendChild(b);
    }).catch(function(){});
  }
  document.addEventListener('DOMContentLoaded', function(){ setTimeout(admInstalarBotao, 2500); });
  setTimeout(admInstalarBotao, 3500); setInterval(admInstalarBotao, 6000);

  // ====================== ESQUECI / REDEFINIR SENHA ======================
  function fpEl(tag, css, txt){ var e=document.createElement(tag); if(css) e.style.cssText=css; if(txt!=null) e.textContent=txt; return e; }
  function fpToast(msg, ok){
    var t=fpEl('div','position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:10003;background:'+(ok?'#15803d':'#b91c1c')+';color:#fff;padding:11px 16px;border-radius:8px;font:600 14px system-ui;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:92%;text-align:center;', msg);
    document.body.appendChild(t); setTimeout(function(){ try{t.remove();}catch(e){} }, 6000);
  }
  // link "Esqueci minha senha" na tela de login
  function instalarEsqueciSenha(){
    try{
      // oculta o link "Esqueci minha senha" original (nao-funcional) do frontend
      Array.from(document.querySelectorAll('a,button,span,div,p,small')).forEach(function(e){
        if(e.id==='fp-link') return;
        if(e.children.length===0 && /esqueci.*senha/i.test(e.textContent||'')){ e.style.display='none'; }
      });
      var campo = document.getElementById('login-senha') || document.getElementById('login-matricula');
      if(!campo || document.getElementById('fp-link')) return;
      var a = fpEl('a','display:block;margin-top:12px;font:600 13px system-ui;color:#ffffff;cursor:pointer;text-decoration:underline;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.4);', 'Esqueci minha senha');
      a.id='fp-link'; a.href='#';
      a.onclick=function(ev){ ev.preventDefault();
        var mf=document.getElementById('login-matricula');
        var email = normEmail((mf&&mf.value)||'');
        if(!email){ fpToast('Digite seu e-mail no campo acima e clique novamente.', false); return; }
        sbReady.then(function(sb){
          sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function(r){
            if(r.error) fpToast('Erro: '+r.error.message, false);
            else fpToast('Se o e-mail existir, enviamos um link para redefinir a senha. Verifique sua caixa de entrada (e o spam).', true);
          });
        });
      };
      var form = (campo.closest && campo.closest('form')) || campo.parentElement;
      (form||campo).appendChild(a);
    }catch(e){}
  }
  document.addEventListener('DOMContentLoaded', function(){ setTimeout(instalarEsqueciSenha, 600); });
  setTimeout(instalarEsqueciSenha, 1200); setTimeout(instalarEsqueciSenha, 2500);

  // tela de definir nova senha (apos clicar no link do e-mail: evento PASSWORD_RECOVERY)
  function mostrarNovaSenha(sb){
    if(document.getElementById('fp-overlay')) return;
    var ov=fpEl('div','position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:10002;display:flex;align-items:center;justify-content:center;padding:16px;');
    ov.id='fp-overlay';
    var card=fpEl('div','background:#fff;max-width:380px;width:100%;border-radius:12px;padding:22px;font:14px system-ui;color:#0f172a;box-shadow:0 10px 40px rgba(0,0,0,.3);');
    card.appendChild(fpEl('div','font:700 17px system-ui;margin-bottom:6px;','Definir nova senha'));
    card.appendChild(fpEl('div','color:#64748b;margin-bottom:12px;','Digite a sua nova senha (mínimo 6 caracteres).'));
    var inp=fpEl('input','width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px;margin-bottom:10px;box-sizing:border-box;'); inp.type='text'; inp.placeholder='Nova senha';
    var b=fpEl('button','width:100%;background:#15803d;color:#fff;border:0;border-radius:8px;padding:10px;font-weight:600;cursor:pointer;','Salvar nova senha');
    b.onclick=function(){ var ns=inp.value||''; if(ns.length<6){ fpToast('A senha precisa de ao menos 6 caracteres.', false); return; }
      b.disabled=true; b.textContent='Salvando...';
      sb.auth.updateUser({ password: ns }).then(function(r){
        b.disabled=false; b.textContent='Salvar nova senha';
        if(r.error){ fpToast('Erro: '+r.error.message, false); }
        else { try{ov.remove();}catch(e){} fpToast('Senha alterada com sucesso! Faça login com a nova senha.', true); sb.auth.signOut(); try{ history.replaceState(null,'',location.pathname); }catch(e){} }
      });
    };
    card.appendChild(inp); card.appendChild(b); ov.appendChild(card); document.body.appendChild(ov);
  }
  sbReady.then(function(sb){
    try{ sb.auth.onAuthStateChange(function(event){ if(event==='PASSWORD_RECOVERY'){ mostrarNovaSenha(sb); } }); }catch(e){}
    try{ if(/type=recovery/.test(location.hash||'')){ setTimeout(function(){ mostrarNovaSenha(sb); }, 900); } }catch(e){}
  });
})();
