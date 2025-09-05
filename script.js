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

// --- Elementos do DOM da Aplicação ---
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

// --- Elementos do DOM para Autenticação ---
const appContainerEl = document.getElementById('app-container');
const loginContainerEl = document.getElementById('login-container');
const loginEmailEl = document.getElementById('login-email');
const loginPasswordEl = document.getElementById('login-password');
const btnLoginEl = document.getElementById('btnLogin');
const btnLogoutEl = document.getElementById('btnLogout');

// --- Variáveis Globais ---
let jogadores = [];
let editKey = null;
let ultimoSorteio = null;
let db, auth, jogadoresRef, sorteiosRef;
let equipeBranco = [], equipeLaranja = [];
let selecionadoParaTroca = null;

const ORDEM = ['goleiro','zagueiro','lateral','meio-campo','atacante'];
const EMOJIS = { 
  velocidade:'🏃', defesa:'🛡️', ataque:'⚔️', preparoFisico:'💪', cabeceio:'🤕', finalizacao:'🎯',
  passe:'📍', dominio:'🧲', drible:'🪄', forca:'🏋️', guardaRedes:'🧤', agilidade:'⚡',
  pe:'🦶', papagaio:'🦜'
};

// --- Funções da Aplicação (sem alterações na lógica interna) ---
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
    const skills = [`${EMOJIS.pe} ${j.pe||'N/A'}`, `${EMOJIS.papagaio} ${j.papagaio==='sim'?'Sim':'Não'}`].join(' · ');
    const skills2 = Object.keys(EMOJIS).filter(k => k !== 'pe' && k !== 'papagaio').map(k => `${EMOJIS[k]} ${validarNumero(j[k])}`).join(' · ');

    return `
      <div class="item">
        <div class="item-head">
          <div class="item-left">
            <input type="checkbox" ${j.selecionado!==false?'checked':''} onchange="toggleSelecao('${j.firebaseKey}')">
            <div>
              <div><strong>${j.nome}</strong> (${score})</div>
              <div class="pill-group">${pref}${posicoes}</div>
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
  Object.keys(EMOJIS).filter(k => k !== 'pe' && k !== 'papagaio').forEach(a=>document.getElementById(a).value = validarNumero(j[a]));
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
    if(!nome || !pe || posicoes.length===0) return alert('Nome, Pé e ao menos uma Posição são obrigatórios.');
    
    const j = { nome, pe, posicoes, selecionado: true };
    ['papagaio', 'preferida', ...Object.keys(EMOJIS).filter(k => k !== 'pe' && k !== 'papagaio')]
      .forEach(id => j[id] = document.getElementById(id).value);

    if(editKey){
      await set(ref(db, `jogadores/${editKey}`), { ...j, firebaseKey: editKey });
      mostrarStatus('Jogador atualizado com sucesso!');
    }else{
      const novoRef = await push(jogadoresRef, j);
      await update(novoRef, { firebaseKey: novoRef.key });
      mostrarStatus('Jogador cadastrado com sucesso!');
    }
    limparFormulario();
  }catch(e){ console.error(e); mostrarStatus('Erro ao salvar jogador: '+e.message,true) }
});

btnCancelar.addEventListener('click', limparFormulario);

function limparFormulario(){
  editKey=null;
  document.getElementById('add-edit-form').reset();
  ['velocidade','defesa','ataque','preparoFisico','cabeceio','finalizacao','passe','dominio','drible','forca','guardaRedes','agilidade']
    .forEach(a=>document.getElementById(a).value='7');
  btnSalvar.textContent='Salvar Jogador';
  btnCancelar.style.display='none';
}

btnDividir.addEventListener('click', ()=>{
  const jogadoresPorEquipe = parseInt(jogadoresPorEquipeEl.value) || 10;
  const selecionados = jogadores.filter(j => j.selecionado !== false);

  if (selecionados.length < jogadoresPorEquipe * 2) {
      alert(`São necessários ${jogadoresPorEquipe * 2} jogadores para formar dois times de ${jogadoresPorEquipe}. Atualmente, ${selecionados.length} estão selecionados.`);
      return;
  }
  
  // Lógica de sorteio e formação de times continua a mesma
  const pools = {};
  ORDEM.forEach(p => pools[p] = []);

  selecionados.forEach(j => {
    const pos = posPreferidaOuPrimeira(j);
    j._score = calcularScorePosicao(j, pos);
    pools[pos].push(j);
  });

  Object.keys(pools).forEach(pos => pools[pos].sort((a, b) => b._score - a._score));

  equipeBranco = [];
  equipeLaranja = [];

  // Distribuição equilibrada
  selecionados.sort((a,b) => b._score - a._score).forEach((jogador, index) => {
    if (index % 2 === 0) {
        if (equipeBranco.length < jogadoresPorEquipe) equipeBranco.push(jogador);
        else equipeLaranja.push(jogador);
    } else {
        if (equipeLaranja.length < jogadoresPorEquipe) equipeLaranja.push(jogador);
        else equipeBranco.push(jogador);
    }
  });

  const scoreBranco = equipeBranco.reduce((acc, j) => acc + j._score, 0);
  const scoreLaranja = equipeLaranja.reduce((acc, j) => acc + j._score, 0);

  const ordenar = (arr) => arr.sort((a,b) => ORDEM.indexOf(a._posicaoEscalada || posPreferidaOuPrimeira(a)) - ORDEM.indexOf(b._posicaoEscalada || posPreferidaOuPrimeira(b)));
  ordenar(equipeBranco);
  ordenar(equipeLaranja);

  renderResultado(equipeBranco, equipeLaranja, scoreBranco, scoreLaranja);

  ultimoSorteio = {
    branco: equipeBranco.map(j=>({nome:j.nome,posicao:j._posicaoEscalada||posPreferidaOuPrimeira(j),score:j._score})),
    laranja: equipeLaranja.map(j=>({nome:j.nome,posicao:j._posicaoEscalada||posPreferidaOuPrimeira(j),score:j._score})),
    scoreBranco, scoreLaranja, timestamp: Date.now()
  };
  btnSalvarSorteio.disabled=false;
  mostrarStatus('Equipes divididas!');
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
  const infoGK = (pos==='goleiro') ? 
    ` (${EMOJIS.guardaRedes} ${validarNumero(j.guardaRedes)} + ${EMOJIS.agilidade} ${validarNumero(j.agilidade)} → ${scorePos.toFixed(1)})` : 
    ` (${scorePos.toFixed(1)})`;
  
  return `<div class="selectable" draggable="true" data-team="${team}" data-index="${idx}" data-key="${j.firebaseKey}" 
               ondragstart="drag(event)" onclick="selecionarJogador(this)">
            ${pos.charAt(0).toUpperCase()+pos.slice(1)}: <strong>${j.nome}</strong>${infoGK}
          </div>`;
}

// Funções de drag & drop e seleção (sem alterações)
window.allowDrop = ev => ev.preventDefault();
window.drag = ev => {
    ev.dataTransfer.setData("key", ev.target.getAttribute('data-key'));
}
window.drop = ev => {
    ev.preventDefault();
    const draggedKey = ev.dataTransfer.getData("key");
    const targetElement = ev.target.closest('.selectable');
    if (!targetElement) return;

    const sourceJogador = [...equipeBranco, ...equipeLaranja].find(j => j.firebaseKey === draggedKey);
    const targetJogador = [...equipeBranco, ...equipeLaranja].find(j => j.firebaseKey === targetElement.getAttribute('data-key'));
    
    if (sourceJogador && targetJogador && sourceJogador.firebaseKey !== targetJogador.firebaseKey) {
        const idxBranco1 = equipeBranco.findIndex(j => j.firebaseKey === sourceJogador.firebaseKey);
        const idxLaranja1 = equipeLaranja.findIndex(j => j.firebaseKey === sourceJogador.firebaseKey);
        const idxBranco2 = equipeBranco.findIndex(j => j.firebaseKey === targetJogador.firebaseKey);
        const idxLaranja2 = equipeLaranja.findIndex(j => j.firebaseKey === targetJogador.firebaseKey);
        
        if (idxBranco1 > -1 && idxLaranja2 > -1) trocarJogadores('branco', idxBranco1, 'laranja', idxLaranja2);
        else if (idxLaranja1 > -1 && idxBranco2 > -1) trocarJogadores('laranja', idxLaranja1, 'branco', idxBranco2);
    }
}
window.selecionarJogador = element => {
    const key = element.getAttribute('data-key');
    if (selecionadoParaTroca && selecionadoParaTroca.key !== key) {
        const team1 = selecionadoParaTroca.element.getAttribute('data-team');
        const idx1 = parseInt(selecionadoParaTroca.element.getAttribute('data-index'));
        const team2 = element.getAttribute('data-team');
        const idx2 = parseInt(element.getAttribute('data-index'));

        if(team1 !== team2) {
          trocarJogadores(team1, idx1, team2, idx2);
        }
        selecionadoParaTroca.element.classList.remove('selected');
        selecionadoParaTroca = null;
    } else if (selecionadoParaTroca && selecionadoParaTroca.key === key) {
        element.classList.remove('selected');
        selecionadoParaTroca = null;
    } else {
        document.querySelectorAll('.selectable.selected').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        selecionadoParaTroca = { key, element };
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
  auth = getAuth(app); // Inicializa a autenticação
  
  // Referências do banco de dados
  jogadoresRef = ref(db,'jogadores');
  sorteiosRef = ref(db,'sorteios');

  // Lógica de Autenticação
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // Usuário está logado
      loginContainerEl.style.display = 'none';
      appContainerEl.classList.add('show');
      mostrarStatus(`Conectado como ${user.email}.`);

      // Carrega os dados do banco de dados SOMENTE se o usuário estiver logado
      onValue(jogadoresRef,(snap)=>{
        jogadores=[]; 
        snap.forEach(ch=>{ const j = ch.val(); j.firebaseKey = ch.key; jogadores.push(j); });
        renderizarJogadores();
        mostrarStatus(`Conectado! ${jogadores.length} jogadores carregados.`);
      });
      
      onValue(sorteiosRef,(snap)=>{
        const arr=[]; 
        snap.forEach(ch=>arr.push(ch.val()));
        renderizarHistorico(arr);
      });

    } else {
      // Usuário está deslogado
      loginContainerEl.style.display = 'block';
      appContainerEl.classList.remove('show');
      mostrarStatus('Por favor, faça o login para continuar.');
    }
  });

  // Event Listeners dos botões de login/logout
  btnLoginEl.addEventListener('click', async () => {
    const email = loginEmailEl.value;
    const password = loginPasswordEl.value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        mostrarStatus(`Erro no login: ${error.message}`, true);
    }
  });

  btnLogoutEl.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        mostrarStatus(`Erro ao sair: ${error.message}`, true);
    }
  });

} catch(e) { 
  console.error('Firebase init',e); 
  mostrarStatus('Erro ao conectar com Firebase: '+e.message,true);
}