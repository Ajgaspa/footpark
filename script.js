import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, push, set, onValue, update, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// --- Configuração do Firebase (sem alterações) ---
const firebaseConfig = {
    apiKey: "AIzaSyC5OFj16f3myELfKS6Xvyuob9CYEPOA26Y",
    authDomain: "footpark-b2cf0.firebaseapp.com",
    databaseURL: "https://footpark-b2cf0-default-rtdb.firebaseio.com",
    projectId: "footpark-b2cf0",
    storageBucket: "footpark-b2cf0.appspot.com",
    messagingSenderId: "296571687653",
    appId: "1:296571687653:web:e2a7ebd15684e6c4dcfa0c"
};

// --- Elementos do DOM (sem alterações) ---
const statusEl = document.getElementById("status");
const listaEl = document.getElementById("listaJogadores");
const countEl = document.getElementById("countJogadores");
const contSelEl = document.getElementById("contSelecionados");
const resultadoEl = document.getElementById("resultadoSorteio");
const historicoEl = document.getElementById("historicoSorteios");
const jogadoresPorEquipeEl = document.getElementById("jogadoresPorEquipe");
const appContainerEl = document.getElementById('app-container');
const loginContainerEl = document.getElementById('login-container');
const loginEmailEl = document.getElementById('login-email');
const loginPasswordEl = document.getElementById('login-password');
const btnLoginEl = document.getElementById('btnLogin');
const btnLogoutEl = document.getElementById('btnLogout');

// --- Variáveis Globais ---
let db, auth, jogadoresRef, sorteiosRef;
let jogadores = [];
let editandoJogadorKey = null;
let equipes = null;

// --- Funções Principais (a estrutura delas não muda) ---

function mostrarStatus(mensagem, erro = false) {
    statusEl.textContent = mensagem;
    statusEl.className = erro ? 'status err' : 'status muted'; // Corrigido para usar a classe 'err' definida no CSS
    if (!erro) console.log(mensagem);
}

function carregarOpcoesSelect() {
    const nivelEl = document.getElementById('nivel');
    const agilidadeEl = document.getElementById('agilidade');
    for (let i = 10; i >= 1; i--) {
        nivelEl.innerHTML += `<option value="${i}">${i}</option>`;
        agilidadeEl.innerHTML += `<option value="${i}">${i}</option>`;
    }
}

function renderizarJogadores() {
    countEl.textContent = jogadores.length;
    if (jogadores.length === 0) {
        listaEl.innerHTML = '<div class="muted">Nenhum jogador cadastrado.</div>';
        return;
    }

    listaEl.innerHTML = jogadores.map(j => `
    <div class="item player-item draggable-player" draggable="true" data-key="${j.firebaseKey}" data-valor="${j.valorTotal}">
      <div class="item-left">
        <div><strong>${j.nome}</strong></div>
        <div class="pill-group">
          ${j.posicoes.map(p => `<div class="pill ${p === 'ataque' ? 'atacante' : p === 'meio' ? 'meio-campo' : p === 'defesa' ? 'zagueiro' : p == 'goleiro' ? 'goleiro' : 'generico'}">${p}</div>`).join('')}
        </div>
      </div>
      <div class="item-right">
        <div class="player-details muted">
          <span>Nível: ${j.nivel}</span> | 
          <span>Agilidade: ${j.agilidade}</span> | 
          <span>Pé: ${j.pe}</span>
        </div>
        <div class="row" style="margin-top:6px">
          <button class="btn btn-sm btn-edit" data-key="${j.firebaseKey}">Editar</button>
          <button class="btn btn-sm btn-danger" data-key="${j.firebaseKey}">Excluir</button>
        </div>
      </div>
    </div>
  `).join('');
    carregarEventosJogadores();
    atualizarContadorSelecionados();
}

function carregarEventosJogadores() {
    document.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', e => editarJogador(e.target.dataset.key)));
    document.querySelectorAll('.btn-danger').forEach(btn => btn.addEventListener('click', e => excluirJogador(e.target.dataset.key)));
}

function editarJogador(key) {
    editandoJogadorKey = key;
    const j = jogadores.find(x => x.firebaseKey === key);
    if (!j) { mostrarStatus('Jogador não encontrado.', true); return; }

    document.getElementById('nome').value = j.nome;
    document.getElementById('pe').value = j.pe;
    document.getElementById('papagaio').value = j.papagaio;
    document.getElementById('nivel').value = j.nivel;
    document.getElementById('agilidade').value = j.agilidade;

    document.querySelectorAll('.posicoes-grid input[type="checkbox"]').forEach(el => el.checked = false);
    j.posicoes.forEach(p => document.getElementById(p).checked = true);
    if (j.posicaoPreferida) {
        const prefEl = document.getElementById('preferida-' + j.posicaoPreferida);
        if (prefEl) prefEl.checked = true;
    }

    document.getElementById('btnSalvar').textContent = 'Atualizar Jogador';
    document.getElementById('btnCancelar').style.display = 'inline-block';
}

async function excluirJogador(key) {
    if (confirm('Tem certeza que deseja excluir este jogador?')) {
        try {
            await remove(ref(db, `jogadores/${key}`));
            mostrarStatus('Jogador excluído com sucesso.');
        } catch (e) { mostrarStatus('Erro ao excluir jogador: ' + e.message, true); }
    }
}

function atualizarContadorSelecionados() {
    const cont = document.querySelectorAll('.player-selected').length;
    contSelEl.textContent = cont;
    const btnDiv = document.getElementById('btnDividir');
    btnDiv.disabled = cont < 2;
    jogadoresPorEquipeEl.innerHTML = '';
    if (cont > 0) {
        for (let i = 2; i <= Math.floor(cont / 2); i++) {
            jogadoresPorEquipeEl.innerHTML += `<option value="${i}">${i}</option>`;
        }
    }
}

function renderizarEquipes() {
    if (!equipes) {
        resultadoEl.innerHTML = '<div class="muted">Nenhum sorteio realizado.</div>';
        document.getElementById('btnSalvarSorteio').disabled = true;
        return;
    }
    const html = Object.keys(equipes).map(key => `
    <div class="equipe">
      <h3>Equipe ${key} <span class="muted small">(valor total: ${equipes[key].valor.toFixed(2)})</span></h3>
      <div class="team-list">
        ${equipes[key].jogadores.map(j => `
          <div class="item">
            <div class="item-left"><strong>${j.nome}</strong></div>
            <div class="item-right">
              <div class="player-details muted">
                <span>Nível: ${j.nivel}</span> | 
                <span>Agilidade: ${j.agilidade}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
    resultadoEl.innerHTML = html;
    document.getElementById('btnSalvarSorteio').disabled = false;
}

function renderizarHistorico(sorteios) {
    if (!sorteios || sorteios.length === 0) { historicoEl.innerHTML = '<div class="muted">Nenhum sorteio salvo.</div>'; return; }
    historicoEl.innerHTML = sorteios.reverse().map(s => `
    <div class="item">
      <div><strong>${new Date(s.timestamp).toLocaleString()}</strong></div>
      <div class="item-right">
        ${Object.keys(s.equipes).map(key => `
          <div class="small muted">
            Equipe ${key} (${s.equipes[key].jogadores.map(j => j.nome).join(', ')})
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}


// --- INICIALIZAÇÃO E EVENT LISTENERS ---

// Função principal que será chamada assim que o script carregar
function main() {
    try {
        mostrarStatus('Conectando ao Firebase...');
        const app = initializeApp(firebaseConfig);
        
        // **CORREÇÃO PRINCIPAL:** Inicialize auth e db aqui
        auth = getAuth(app);
        db = getDatabase(app);

        // Referências ao banco de dados
        jogadoresRef = ref(db, 'jogadores');
        sorteiosRef = ref(db, 'sorteios');

        // **CORREÇÃO PRINCIPAL:** Mova todos os event listeners para dentro desta função,
        // para que eles só sejam criados DEPOIS que 'auth' e 'db' existirem.
        
        // Listeners de Autenticação
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // Usuário logado
                loginContainerEl.style.display = 'none';
                appContainerEl.classList.add('show');
                mostrarStatus(`Conectado como ${user.email}. Carregando dados...`);

                // Inicia os listeners do banco de dados somente quando o usuário está logado
                onValue(jogadoresRef, (snap) => {
                    jogadores = [];
                    snap.forEach(ch => { const j = ch.val(); j.firebaseKey = ch.key; jogadores.push(j); });
                    renderizarJogadores();
                    mostrarStatus(`Conectado! ${jogadores.length} jogadores carregados.`);
                });
                onValue(sorteiosRef, (snap) => {
                    const arr = [];
                    snap.forEach(ch => arr.push(ch.val()));
                    renderizarHistorico(arr);
                });

            } else {
                // Usuário deslogado
                loginContainerEl.style.display = 'block';
                appContainerEl.classList.remove('show');
                mostrarStatus('Desconectado. Por favor, faça login.');
            }
        });

        btnLoginEl.addEventListener('click', async () => {
            const email = loginEmailEl.value;
            const password = loginPasswordEl.value;
            try {
                await signInWithEmailAndPassword(auth, email, password);
                mostrarStatus('Login bem-sucedido!');
            } catch (error) {
                mostrarStatus('Erro no login: ' + error.message, true);
            }
        });

        btnLogoutEl.addEventListener('click', async () => {
            try {
                await signOut(auth);
                mostrarStatus('Sessão encerrada.');
            } catch (error) {
                mostrarStatus('Erro ao sair: ' + error.message, true);
            }
        });

        // Listeners da Aplicação
        document.getElementById('btnSalvar').addEventListener('click', async () => {
            const nome = document.getElementById('nome').value;
            const pe = document.getElementById('pe').value;
            const papagaio = document.getElementById('papagaio').value;
            const nivel = parseInt(document.getElementById('nivel').value);
            const agilidade = parseInt(document.getElementById('agilidade').value);
            const posicoes = Array.from(document.querySelectorAll('.posicoes-grid input[type="checkbox"]:checked:not(.preferida-check)')).map(el => el.value);
            const posicaoPreferidaEl = document.querySelector('.posicoes-grid input.preferida-check:checked');
            const posicaoPreferida = posicaoPreferidaEl ? posicaoPreferidaEl.id.replace('preferida-', '') : null; // Corrigido para pegar o ID e remover 'preferida-'

            if (!nome || !pe || posicoes.length === 0) {
                mostrarStatus('Por favor, preencha todos os campos obrigatórios.', true); return;
            }

            const jogador = {
                nome, pe, papagaio, nivel, agilidade, posicoes, posicaoPreferida,
                valorTotal: nivel + agilidade +
                    (papagaio === 'sim' ? 1.5 : 0) +
                    (posicoes.length === 1 ? 1 : 0) +
                    (posicaoPreferida ? 2 : 0)
            };

            try {
                if (editandoJogadorKey) {
                    await update(ref(db, `jogadores/${editandoJogadorKey}`), jogador);
                    mostrarStatus('Jogador atualizado com sucesso.');
                    editandoJogadorKey = null;
                    document.getElementById('btnSalvar').textContent = 'Salvar Jogador';
                    document.getElementById('btnCancelar').style.display = 'none';
                } else {
                    await push(jogadoresRef, jogador);
                    mostrarStatus('Jogador salvo com sucesso.');
                }
                document.getElementById('nome').value = '';
                document.getElementById('pe').value = '';
                document.getElementById('papagaio').value = 'nao';
                document.getElementById('nivel').value = '5';
                document.getElementById('agilidade').value = '5';
                document.querySelectorAll('.posicoes-grid input[type="checkbox"]').forEach(el => el.checked = false);
            } catch (e) { mostrarStatus('Erro ao salvar jogador: ' + e.message, true); }
        });

        document.getElementById('btnCancelar').addEventListener('click', () => {
            editandoJogadorKey = null;
            document.getElementById('btnSalvar').textContent = 'Salvar Jogador';
            document.getElementById('btnCancelar').style.display = 'none';
            document.getElementById('nome').value = '';
            document.getElementById('pe').value = '';
            document.getElementById('papagaio').value = 'nao';
            document.getElementById('nivel').value = '5';
            document.getElementById('agilidade').value = '5';
            document.querySelectorAll('.posicoes-grid input[type="checkbox"]').forEach(el => el.checked = false);
            mostrarStatus('Edição cancelada.');
        });
        
        document.querySelectorAll('.posicoes-grid input[type="checkbox"]').forEach(el => {
            el.addEventListener('change', () => {
                const isPref = el.classList.contains('preferida-check');
                if (isPref && el.checked) { // Apenas se estiver marcando como preferida
                    // Desmarca as outras preferidas
                    document.querySelectorAll('.posicoes-grid input.preferida-check').forEach(other => {
                        if (other !== el) other.checked = false;
                    });
                    // Garante que a posição correspondente está marcada
                    const posId = el.id.replace('preferida-', '');
                    document.getElementById(posId).checked = true;
                } else if (isPref && !el.checked) {
                    // Se desmarcar a preferida, não faz nada com a posição em si
                } else {
                    // Se desmarcar uma posição que era preferida, desmarca a preferida também
                    const prefId = 'preferida-' + el.id;
                    const prefEl = document.getElementById(prefId);
                    if(prefEl && !el.checked) {
                        prefEl.checked = false;
                    }
                }
            });
        });

        document.getElementById('btnDividir').addEventListener('click', () => {
            const selec = Array.from(document.querySelectorAll('.player-selected'));
            if (selec.length < 2) { mostrarStatus('Selecione ao menos 2 jogadores.', true); return; }
            const jogadoresSelecionados = selec.map(el => jogadores.find(j => j.firebaseKey === el.dataset.key));
            const jpe = parseInt(jogadoresPorEquipeEl.value) || 0;
            if (jpe === 0) { mostrarStatus('Número de jogadores por equipe inválido.', true); return; }

            equipes = {};
            const numEquipes = Math.floor(jogadoresSelecionados.length / jpe);
            for (let i = 1; i <= numEquipes; i++) equipes[i] = { jogadores: [], valor: 0 };

            jogadoresSelecionados.sort((a, b) => b.valorTotal - a.valorTotal);
            
            // Lógica de distribuição "serpente" para balancear melhor
            let direcao = 1;
            let equipeAtual = 1;
            jogadoresSelecionados.forEach(j => {
                equipes[equipeAtual].jogadores.push(j);
                equipes[equipeAtual].valor += j.valorTotal;

                equipeAtual += direcao;
                if(equipeAtual > numEquipes){
                    equipeAtual = numEquipes;
                    direcao = -1;
                }
                if(equipeAtual < 1){
                    equipeAtual = 1;
                    direcao = 1;
                }
            });

            renderizarEquipes();
            mostrarStatus(`Equipes divididas com sucesso. ${jogadoresSelecionados.length} jogadores em ${numEquipes} equipes.`);
        });

        document.getElementById('btnSalvarSorteio').addEventListener('click', async () => {
            if (!equipes) { mostrarStatus('Não há sorteio para salvar.', true); return; }
            const sorteio = {
                timestamp: Date.now(),
                equipes
            };
            try {
                await push(sorteiosRef, sorteio);
                mostrarStatus('Sorteio salvo com sucesso.');
                equipes = null;
                renderizarEquipes();
            } catch (e) { mostrarStatus('Erro ao salvar sorteio: ' + e.message, true) }
        });
        
        document.getElementById('listaJogadores').addEventListener('click', (e) => {
            const playerItem = e.target.closest('.player-item');
            if (playerItem) {
                playerItem.classList.toggle('player-selected');
                atualizarContadorSelecionados();
            }
        });


        // Funções que rodam na inicialização do app
        carregarOpcoesSelect();

    } catch (e) {
        console.error('Erro na inicialização do Firebase:', e);
        mostrarStatus('Erro fatal ao conectar com Firebase: ' + e.message, true);
    }
}

// Inicia a aplicação
main();