import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, push, set, onValue, update, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// --- Configuração do Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyC5OFj16f3myELfKS6Xvyuob9CYEPOA26Y",
    authDomain: "footpark-b2cf0.firebaseapp.com",
    databaseURL: "https://footpark-b2cf0-default-rtdb.firebaseio.com",
    projectId: "footpark-b2cf0",
    storageBucket: "footpark-b2cf0.appspot.com",
    messagingSenderId: "296571687653",
    appId: "1:296571687653:web:e2a7ebd15684e6c4dcfa0c"
};

// --- Elementos do DOM (Originais) ---
const statusEl = document.getElementById("status");
const listaEl = document.getElementById("listaJogadores");
const countEl = document.getElementById("countJogadores");
const contSelEl = document.getElementById("contSelecionados");
const resultadoEl = document.getElementById("resultadoSorteio");
const historicoEl = document.getElementById("historicoSorteios");
const jogadoresPorEquipeEl = document.getElementById("jogadoresPorEquipe");
const btnSalvar = document.getElementById("btnSalvar");
const btnCancelar = document.getElementById("btnCancelar");
const btnDividir = document.getElementById("btnDividir");
const btnSalvarSorteio = document.getElementById("btnSalvarSorteio");

// --- Elementos do DOM (Para Autenticação) ---
const appContainerEl = document.getElementById('app-container');
const loginContainerEl = document.getElementById('login-container');
const loginEmailEl = document.getElementById('login-email');
const loginPasswordEl = document.getElementById('login-password');
const btnLoginEl = document.getElementById('btnLogin');
const btnLogoutEl = document.getElementById('btnLogout');


// --- Variáveis Globais (Originais + Auth) ---
let jogadores = [];
let editKey = null;
let ultimoSorteio = null;
let db, auth, jogadoresRef, sorteiosRef;
let equipeBranco = [], equipeLaranja = [];
let selecionadoParaTroca = null;

// --- Constantes (Originais) ---
const ORDEM = ['goleiro','zagueiro','lateral','meio-campo','atacante'];
const EMOJIS = { 
  velocidade:'🏃', defesa:'🛡️', ataque:'⚔️', preparoFisico:'💪', cabeceio:'🤕', finalizacao:'🎯',
  passe:'📍', dominio:'🧲', drible:'🪄', forca:'🏋️', guardaRedes:'🧤', agilidade:'⚡',
  pe:'🦶', papagaio:'🦜'
};

// --- Funções Originais (Sem Nenhuma Alteração) ---
function opt0a10(sel){ sel.innerHTML = Array.from({length:11},(_,n)=>`<option value="${n}">${n}</option>`).join(''); sel.value = '7'; }
['velocidade','defesa','ataque','preparoFisico','cabeceio','finalizacao','passe','dominio','drible','forca','guardaRedes','agilidade']
  .forEach(id=>opt0a10(document.getElementById(id)));

function preencherJogadoresPorEquipe() {
  let options = '';
  for (let i = 2; i <= 12; i++) {
    options += `<option value="${i}">${i}</option>`;
  }
  jogadoresPorEquipeEl.innerHTML = options;
  jogadoresPorEquipeEl.value = '10'; // Valor padrão
}
preencherJogadoresPorEquipe();

function mostrarStatus(msg, isError=false){ statusEl.textContent=msg; statusEl.className=`status ${isError?'err':'ok'}` }
function validarNumero(v){ const n = parseInt(v); return isNaN(n)?7:Math.max(0,Math.min(10,n)); }

function calcularScoreGeral(j){
  const ehGoleiro = (j.posicoes && j.posicoes.includes('goleiro')) || j.preferida === 'goleiro';
  let attrs = ['velocidade','defesa','ataque','preparoFisico','cabeceio','finalizacao','passe','dominio','drible','forca','agilidade']
    .map(k=>validarNumero(j[k]));
  
  if(ehGoleiro){
    attrs.push(validarNumero(j.guardaRedes));
  }
  
  const media = attrs.reduce((a,b)=>a+b,0)/attrs.length;
  const bonusPe = j.pe==='ambidestro'?1:0.5;
  return media+bonusPe;
}

function calcularScorePosicao(j,pos){
  if(pos==='goleiro'){
    const gr = validarNumero(j.guardaRedes);
    const ag = validarNumero(j.agilidade);
    return (gr+ag)/2;
  }
  const attrs = ['velocidade','defesa','ataque','preparoFisico','cabeceio','finalizacao','passe','dominio','drible','forca','agilidade']
    .map(k=>validarNumero(j[k]));
  const media = attrs.reduce((a,b)=>a+b,0)/attrs.length;
  const bonusPe = j.pe==='ambidestro'?1:0.5;
  return media+bonusPe;
}

function posPreferidaOuPrimeira(j){ return j.preferida || (j.posicoes && j.posicoes[0]) || 'atacante' }

function renderizarJogadores(){
  const ordenados = [...jogadores].sort((a,b)=>ORDEM.indexOf(posPreferidaOuPrimeira(a))-ORDEM.indexOf(posPreferidaOuPrimeira(b)));
  countEl.textContent = ordenados.length;
  const selCount = ordenados.filter(j=>j.selecionado!==false).length;
  contSelEl.textContent = `— selecionados: ${selCount}`;

  if(ordenados.length===0){ listaEl.innerHTML='<div class="muted">Nenhum jogador cadastrado.</div>'; return; }

  listaEl.innerHTML = ordenados.map((j)=>{
    const posicoes = (j.posicoes||[]).map(p=>`<span class="pill ${p}">${p.charAt(0).toUpperCase()+p.slice(1)}</span>`).join('');
    const pref = j.preferida?`<span class="pill ${j.preferida} preferida"><i class="position-star">⭐</i>${j.preferida.charAt(0).toUpperCase()+j.preferida.slice(1)}</span>`:'';
    const score = calcularScoreGeral(j).toFixed(1);
    const skills = [ `${EMOJIS.pe} ${j.pe||'N/A'}`, `${EMOJIS.papagaio} ${j.papagaio==='sim'?'Sim':'Não'}` ].join(' · ');
    const skills2 = [ `${EMOJIS.velocidade} ${validarNumero(j.velocidade)}`, `${EMOJIS.defesa} ${validarNumero(j.defesa)}`, `${EMOJIS.ataque} ${validarNumero(j.ataque)}`, `${EMOJIS.preparoFisico} ${validarNumero(j.preparoFisico)}`, `${EMOJIS.cabeceio} ${validarNumero(j.cabeceio)}`, `${EMOJIS.finalizacao} ${validarNumero(j.finalizacao)}`, `${EMOJIS.passe} ${validarNumero(j.passe)}`, `${EMOJIS.dominio} ${validarNumero(j.dominio)}`, `${EMOJIS.drible} ${validarNumero(j.drible)}`, `${EMOJIS.forca} ${validarNumero(j.forca)}`, `${EMOJIS.guardaRedes} ${validarNumero(j.guardaRedes)}`, `${EMOJIS.agilidade} ${validarNumero(j.agilidade)}` ].join(' · ');

    return `
      <div class="item">
        <div class="item-head">
          <div class="item-left">
            <input type="checkbox" ${j.selecionado!==false?'checked':''} onchange="toggleSelecao('${j.firebaseKey}')">
            <div>
              <div><strong>${j.nome}</strong> (${score})</div>
              <div class="pill-group">
                ${posicoes}
                ${pref}
              </div>
            </div>
          </div>
          <div class="item-right">
            <div class="skills-line">${skills}</div>
            <div class="skills-line">${skills2}</div>
            <div class="row" style="justify-content:flex-end;margin-top:8px">
              <button class="btn btn-warn" onclick="editarJogador('${j.firebaseKey}')">Editar</button>
              <button class="btn btn-danger" onclick="excluirJogador('${j.firebaseKey}')">Excluir</button>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

window.toggleSelecao = async (key)=>{
  const j = jogadores.find(x=>x.firebaseKey===key);
  if(!j) return;
  const novo = !(j.selecionado!==false);
  await update(ref(db, `jogadores/${j.firebaseKey}`), { selecionado:novo });
}

window.editarJogador = (key)=>{
  const j = jogadores.find(x=>x.firebaseKey===key);
  if(!j) return;
  editKey = j.firebaseKey;
  document.getElementById('nome').value = j.nome||'';
  document.getElementById('pe').value = j.pe||'';
  document.getElementById('papagaio').value = j.papagaio||'nao';
  document.getElementById('preferida').value = j.preferida||'';
  document.querySelectorAll('#posicoes input[type="checkbox"]').forEach(cb=>cb.checked=(j.posicoes||[]).includes(cb.value));
  ['velocidade','defesa','ataque','preparoFisico','cabeceio','finalizacao','passe','dominio','drible','forca','guardaRedes','agilidade']
    .forEach(a=>document.getElementById(a).value = validarNumero(j[a]));
  btnSalvar.textContent='Atualizar Jogador';
  btnCancelar.style.display='inline-block';
}

window.excluirJogador = async (key)=>{
  const j = jogadores.find(x=>x.firebaseKey===key);
  if(j && confirm(`Excluir ${j.nome}?`)) await remove(ref(db, `jogadores/${j.firebaseKey}`));
}

btnSalvar.addEventListener('click', async ()=>{
  try{
    const nome = document.getElementById('nome').value.trim();
    const pe = document.getElementById('pe').value;
    const posicoes = Array.from(document.querySelectorAll('#posicoes input[type="checkbox"]:checked')).map(cb=>cb.value);
    if(!nome) return alert('Nome é obrigatório');
    if(!pe) return alert('Pé dominante é obrigatório');
    if(posicoes.length===0) return alert('Selecione ao menos uma posição');
    const j = {
      nome, pe,
      papagaio: document.getElementById('papagaio').value,
      posicoes,
      preferida: document.getElementById('preferida').value,
      velocidade: validarNumero(document.getElementById('velocidade').value),
      defesa: validarNumero(document.getElementById('defesa').value),
      ataque: validarNumero(document.getElementById('ataque').value),
      preparoFisico: validarNumero(document.getElementById('preparoFisico').value),
      cabeceio: validarNumero(document.getElementById('cabeceio').value),
      finalizacao: validarNumero(document.getElementById('finalizacao').value),
      passe: validarNumero(document.getElementById('passe').value),
      dominio: validarNumero(document.getElementById('dominio').value),
      drible: validarNumero(document.getElementById('drible').value),
      forca: validarNumero(document.getElementById('forca').value),
      guardaRedes: validarNumero(document.getElementById('guardaRedes').value),
      agilidade: validarNumero(document.getElementById('agilidade').value),
      selecionado: true
    };
    if(editKey){
      await set(ref(db, `jogadores/${editKey}`), { ...j, firebaseKey: editKey });
      mostrarStatus('Jogador atualizado com sucesso!');
    }else{
      const novoRef = await push(jogadoresRef, j);
      await update(ref(db, `jogadores/${novoRef.key}`), { firebaseKey: novoRef.key });
      mostrarStatus('Jogador cadastrado com sucesso!');
    }
    limparFormulario();
  }catch(e){ console.error(e); mostrarStatus('Erro ao salvar jogador: '+e.message,true) }
});

btnCancelar.addEventListener('click', limparFormulario);
function limparFormulario(){
  editKey=null; ['nome','pe','papagaio','preferida'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('papagaio').value='nao';
  document.querySelectorAll('#posicoes input[type="checkbox"]').forEach(cb=>cb.checked=false);
  ['velocidade','defesa','ataque','preparoFisico','cabeceio','finalizacao','passe','dominio','drible','forca','guardaRedes','agilidade']
    .forEach(a=>document.getElementById(a).value='7');
  btnSalvar.textContent='Salvar Jogador';
  btnCancelar.style.display='none';
}

btnDividir.addEventListener('click', ()=>{
  const jogadoresPorEquipe = parseInt(jogadoresPorEquipeEl.value)||10;
  const selecionados = jogadores.filter(j=>j.selecionado!==false);
  
  if (selecionados.length === 0) {
      alert("Nenhum jogador selecionado.");
      return;
  }
  
  const totalNecessario = jogadoresPorEquipe * 2;
  const diff = Math.abs(selecionados.length - totalNecessario);

  if (diff > 1) {
      alert(`O sorteio precisa de um número total de jogadores de ${totalNecessario} para equipes de ${jogadoresPorEquipe}. Selecione ${totalNecessario} jogadores.`);
      return;
  }

  const numTime1 = Math.ceil(selecionados.length / 2);
  const numTime2 = Math.floor(selecionados.length / 2);

  const formacao = { 'goleiro': 1, 'zagueiro': Math.max(1, Math.floor(jogadoresPorEquipe * 0.1)), 'lateral': Math.max(1, Math.floor(jogadoresPorEquipe * 0.2)), 'meio-campo': Math.max(1, Math.floor(jogadoresPorEquipe * 0.3)), 'atacante': Math.max(1, Math.floor(jogadoresPorEquipe * 0.3)) };
  const total = Object.values(formacao).reduce((a,b)=>a+b,0);
  if(total < jogadoresPorEquipe) { formacao['meio-campo'] += jogadoresPorEquipe - total; }

  const pools = { 'goleiro': [], 'zagueiro': [], 'lateral': [], 'meio-campo': [], 'atacante': [] };

  selecionados.forEach(j => {
    const pos = posPreferidaOuPrimeira(j);
    j._score = calcularScorePosicao(j, pos) + (Math.random() - 0.5) * 0.3;
    pools[pos].push(j);
  });

  Object.keys(pools).forEach(pos => pools[pos].sort((a, b) => b._score - a._score));

  equipeBranco = []; equipeLaranja = [];
  let scoreBranco = 0, scoreLaranja = 0;

  ORDEM.forEach(pos => {
    const needed = formacao[pos] * 2;
    const available = pools[pos];
    for(let i = 0; i < needed && available.length > 0; i++) {
      const jogador = available.shift();
      jogador._posicaoEscalada = pos;
      if(scoreBranco <= scoreLaranja && equipeBranco.length < numTime1) {
        equipeBranco.push(jogador); scoreBranco += jogador._score;
      } else if(equipeLaranja.length < numTime2) {
        equipeLaranja.push(jogador); scoreLaranja += jogador._score;
      }
    }
  });

  const restantes = [];
  Object.values(pools).forEach(pool => restantes.push(...pool));
  restantes.sort((a, b) => b._score - a._score);

  restantes.forEach(jogador => {
    if(equipeBranco.length >= numTime1 && equipeLaranja.length >= numTime2) return;
    jogador._posicaoEscalada = posPreferidaOuPrimeira(jogador);
    if(equipeBranco.length < numTime1 && (scoreBranco <= scoreLaranja || equipeLaranja.length >= numTime2)) {
      equipeBranco.push(jogador); scoreBranco += jogador._score;
    } else if(equipeLaranja.length < numTime2) {
      equipeLaranja.push(jogador); scoreLaranja += jogador._score;
    }
  });

  equipeBranco = equipeBranco.slice(0, numTime1);
  equipeLaranja = equipeLaranja.slice(0, numTime2);

  const ordenar = (arr) => arr.sort((a,b) => ORDEM.indexOf(a._posicaoEscalada || posPreferidaOuPrimeira(a)) - ORDEM.indexOf(b._posicaoEscalada || posPreferidaOuPrimeira(b)));
  ordenar(equipeBranco); ordenar(equipeLaranja);

  renderResultado(equipeBranco, equipeLaranja, scoreBranco, scoreLaranja);

  ultimoSorteio = {
    branco: equipeBranco.map(j=>({nome:j.nome,posicao:j._posicaoEscalada||posPreferidaOuPrimeira(j),score:j._score})),
    laranja: equipeLaranja.map(j=>({nome:j.nome,posicao:j._posicaoEscalada||posPreferidaOuPrimeira(j),score:j._score})),
    scoreBranco: scoreBranco, scoreLaranja: scoreLaranja, timestamp: Date.now()
  };
  btnSalvarSorteio.disabled=false;
  mostrarStatus('Equipes divididas com formação tática!');
});

function renderResultado(eqB, eqL, scoreB, scoreL){
  resultadoEl.innerHTML = `
    <div class="equipe" ondrop="drop(event)" ondragover="allowDrop(event)" data-team="branco">
      <h3>Equipe Branco (${(scoreB / eqB.length).toFixed(2)})</h3>
      ${eqB.map((j, idx) => criarLinhaJogador(j, 'branco', idx)).join('')}
    </div>
    <div class="equipe" ondrop="drop(event)" ondragover="allowDrop(event)" data-team="laranja">
      <h3>Equipe Laranja (${(scoreL / eqL.length).toFixed(2)})</h3>
      ${eqL.map((j, idx) => criarLinhaJogador(j, 'laranja', idx)).join('')}
    </div>`;
}

function criarLinhaJogador(j, team, idx) {
  const pos = j._posicaoEscalada || posPreferidaOuPrimeira(j);
  const scorePos = calcularScorePosicao(j, pos);
  const infoGK = (pos==='goleiro') ? ` (${EMOJIS.guardaRedes} ${validarNumero(j.guardaRedes)} + ${EMOJIS.agilidade} ${validarNumero(j.agilidade)} → ${scorePos.toFixed(1)})` : ` (${scorePos.toFixed(1)})`;
  return `<div class="selectable" draggable="true" data-team="${team}" data-index="${idx}" data-key="${j.firebaseKey}" ondragstart="drag(event)" onclick="selecionarJogador(this)">${pos.charAt(0).toUpperCase()+pos.slice(1)}: <strong>${j.nome}</strong>${infoGK}</div>`;
}

window.allowDrop = function(ev) { ev.preventDefault(); }
window.drag = function(ev) { ev.dataTransfer.setData("text/plain", ev.target.getAttribute('data-key')); }
window.drop = function(ev) {
    ev.preventDefault();
    const draggedKey = ev.dataTransfer.getData("text/plain");
    const draggedElement = document.querySelector(`.selectable[data-key="${draggedKey}"]`);
    const sourceTeam = draggedElement.getAttribute('data-team');
    const sourceIndex = parseInt(draggedElement.getAttribute('data-index'));

    const targetElement = ev.target.closest('.selectable');
    if (targetElement) {
        const targetTeam = targetElement.getAttribute('data-team');
        const targetIndex = parseInt(targetElement.getAttribute('data-index'));
        if (sourceTeam !== targetTeam) {
            trocarJogadores(sourceTeam, sourceIndex, targetTeam, targetIndex);
        }
    }
}
window.selecionarJogador = function(element) {
    if (selecionadoParaTroca) {
        const primeiroElemento = document.querySelector(`.selectable[data-key="${selecionadoParaTroca.key}"]`);
        if (selecionadoParaTroca.team !== element.getAttribute('data-team')) {
            trocarJogadores(selecionadoParaTroca.team, selecionadoParaTroca.index, element.getAttribute('data-team'), parseInt(element.getAttribute('data-index')));
            if (primeiroElemento) primeiroElemento.classList.remove('selected');
            selecionadoParaTroca = null;
        } else {
            if (primeiroElemento) primeiroElemento.classList.remove('selected');
            if (selecionadoParaTroca.key !== element.getAttribute('data-key')) {
                element.classList.add('selected');
                selecionadoParaTroca = { key: element.getAttribute('data-key'), team: element.getAttribute('data-team'), index: parseInt(element.getAttribute('data-index')) };
            } else {
                selecionadoParaTroca = null;
            }
        }
    } else {
        element.classList.add('selected');
        selecionadoParaTroca = { key: element.getAttribute('data-key'), team: element.getAttribute('data-team'), index: parseInt(element.getAttribute('data-index')) };
    }
}

function trocarJogadores(team1, idx1, team2, idx2) {
  const equipe1Arr = team1 === 'branco' ? equipeBranco : equipeLaranja;
  const equipe2Arr = team2 === 'branco' ? equipeBranco : equipeLaranja;
  [equipe1Arr[idx1], equipe2Arr[idx2]] = [equipe2Arr[idx2], equipe1Arr[idx1]];
  const scoreBranco = equipeBranco.reduce((s, j) => s + (j._score || 0), 0);
  const scoreLaranja = equipeLaranja.reduce((s, j) => s + (j._score || 0), 0);
  renderResultado(equipeBranco, equipeLaranja, scoreBranco, scoreLaranja);
}

btnSalvarSorteio.addEventListener('click', async ()=>{
  if(!ultimoSorteio) return;
  try{
    await push(sorteiosRef, ultimoSorteio);
    mostrarStatus('Sorteio salvo no histórico!');
    btnSalvarSorteio.disabled = true;
  }catch(e){ console.error(e); mostrarStatus('Erro ao salvar sorteio: '+e.message,true) }
});

function renderizarHistorico(sorteios){
  if(!sorteios||sorteios.length===0){ historicoEl.innerHTML='<div class="muted">Nenhum sorteio salvo.</div>'; return; }
  historicoEl.innerHTML = sorteios.reverse().map(s=>`
    <div class="item">
      <div><strong>${new Date(s.timestamp).toLocaleString()}</strong></div>
      <div class="small"><strong>Branco:</strong> ${s.branco.map(j=>j.nome).join(', ')}<br>
      <strong>Laranja:</strong> ${s.laranja.map(j=>j.nome).join(', ')}</div>
      <div class="small muted">Média Branco: ${(s.scoreBranco/s.branco.length).toFixed(2)} | Média Laranja: ${(s.scoreLaranja/s.laranja.length).toFixed(2)}</div>
    </div>`).join('');
}

// --- INICIALIZAÇÃO DO FIREBASE E AUTENTICAÇÃO ---
try{
  mostrarStatus('Conectando ao Firebase...');
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  auth = getAuth(app);
  
  jogadoresRef = ref(db,'jogadores');
  sorteiosRef = ref(db,'sorteios');

  // Lógica de Autenticação
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // Usuário logado: mostra o app e carrega os dados
      loginContainerEl.style.display = 'none';
      appContainerEl.classList.add('show');

      onValue(jogadoresRef,(snap)=>{
        jogadores=[]; snap.forEach(ch=>{ const j = ch.val(); j.firebaseKey = ch.key; jogadores.push(j); });
        renderizarJogadores();
        mostrarStatus(`Conectado como ${user.email}! ${jogadores.length} jogadores carregados.`);
      });
      
      onValue(sorteiosRef,(snap)=>{
        const arr=[]; snap.forEach(ch=>arr.push(ch.val()));
        renderizarHistorico(arr);
      });

    } else {
      // Usuário deslogado: mostra a tela de login
      loginContainerEl.style.display = 'block';
      appContainerEl.classList.remove('show');
      mostrarStatus('Por favor, faça o login.');
    }
  });

  // Eventos dos botões de login/logout
  btnLoginEl.addEventListener('click', async () => {
    const email = loginEmailEl.value;
    const password = loginPasswordEl.value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        mostrarStatus(error.message, true);
    }
  });

  btnLogoutEl.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        mostrarStatus(error.message, true);
    }
  });

}catch(e){ 
    console.error('Firebase init',e); 
    mostrarStatus('Erro ao conectar com Firebase: '+e.message,true);
}