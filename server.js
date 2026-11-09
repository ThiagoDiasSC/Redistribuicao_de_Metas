const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const multer = require('multer');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// String de conexão direta com a base de dados do Supabase (Nuvem)
const SUPABASE_CONNECTION_STRING = 'postgresql://postgres.awnklqofukqdlczmqlsl:Mega230499%40Sc@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

// Configuração de conexão do PostgreSQL (Prioriza a variável do Render ou usa a conexão Supabase)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || SUPABASE_CONNECTION_STRING,
  ssl: {
    rejectUnauthorized: false // Obrigatório para conexões SSL na nuvem do Supabase
  }
});

const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname)));

// Configuração do Transportador SMTP (E-mail corporativo de envio de senha)
const transporter = nodemailer.createTransport({
  host: 'megagiromg.com.br',
  port: 465,
  secure: true,
  auth: {
    user: 'reset_senha@megagiromg.com.br',
    pass: '230499@Sc'
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Mapeamento das Mesas/Gerentes para Cliente CIA
const MAPA_REVENDA_CLIENTECIA = {
  '10': '208490',
  '20': '224208',
  '30': '220611',
  '40': '220612',
  '50': '221394',
  '60': '224209'
};

// Mapeamento das Mesas/Gerentes para Lista de Vendedores (Todas as Revendas)
const MAPA_REVENDA_VENDEDORES = {
  '10': ['101', '102', '103', '104', '105', '106', '107', '201', '202', '203'],
  '20': ['251', '252', '253', '254', '255', '256'],
  '30': ['301', '302', '303', '304', '305', '306', '341', '342', '343'],
  '40': ['401', '402', '403', '404', '405', '406', '407', '408', '409'],
  '50': ['501', '502', '503', '504', '505', '506', '521', '522', '523', '524'],
  '60': ['601', '602', '603', '604', '641', '642', '643']
};

function gerarCodCompleto(regiao, numero) {
  const regClean = String(regiao || '').replace(/\D/g, '').padStart(4, '0');
  const numClean = String(numero || '').replace(/\D/g, '').padStart(4, '0');
  return `${regClean}-${numClean}`;
}

async function registrarUltimaImportacao(client, tipoImportacao) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public."MG_Log_Importacoes" (
      "tipo" TEXT PRIMARY KEY,
      "data_importacao" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.query(`
    INSERT INTO public."MG_Log_Importacoes" ("tipo", "data_importacao")
    VALUES ($1, NOW())
    ON CONFLICT ("tipo") DO UPDATE SET "data_importacao" = EXCLUDED."data_importacao";
  `, [tipoImportacao]);
}

// Inicializar a estrutura da tabela MG_Usuarios caso não exista no Supabase
async function inicializarTabelaUsuarios() {
  let client;
  try {
    client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS public."MG_Usuarios" (
        "id" SERIAL PRIMARY KEY,
        "nome" VARCHAR(150) NOT NULL,
        "email" VARCHAR(150) UNIQUE NOT NULL,
        "senha" VARCHAR(255) NOT NULL,
        "funcao" VARCHAR(50) NOT NULL,
        "revenda" VARCHAR(20),
        "cod_vendedor" VARCHAR(20),
        "ativo" BOOLEAN DEFAULT TRUE,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (err) {
    console.error('Erro ao inicializar tabela MG_Usuarios:', err);
  } finally {
    if (client) client.release();
  }
}
inicializarTabelaUsuarios();

// Rotas estáticas de navegação
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/home.html', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/Meta_Vol.html', (req, res) => res.sendFile(path.join(__dirname, 'Meta_Vol.html')));
app.get('/Meta_Cob.html', (req, res) => res.sendFile(path.join(__dirname, 'Meta_Cob.html')));
app.get('/Import.html', (req, res) => res.sendFile(path.join(__dirname, 'Import.html')));
app.get('/Cadastro.html', (req, res) => res.sendFile(path.join(__dirname, 'Cadastro.html')));
app.get('/Trocar_Senha/TrocaSenha.html', (req, res) => res.sendFile(path.join(__dirname, 'Trocar_Senha', 'TrocaSenha.html')));
app.get('/Trocar_Senha/TrocaSenha2.html', (req, res) => res.sendFile(path.join(__dirname, 'Trocar_Senha', 'TrocaSenha2.html')));

// API: Solicitação e Envio de E-mail de Recuperação de Senha
app.post('/api/recover-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Informe o e-mail cadastrado.' });
  }

  const protocol = req.protocol;
  const host = req.get('host');
  const resetLink = `${protocol}://${host}/Trocar_Senha/TrocaSenha2.html?email=${encodeURIComponent(email)}`;

  const mailOptions = {
    from: '"MEGA GIRO" <reset_senha@megagiromg.com.br>',
    to: email,
    subject: 'Redefinição de Senha - MEGA GIRO',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
        <div style="background-color: #006633; padding: 25px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 1px;">MEGA GIRO</h1>
          <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.9;">Distribuidor Autorizado</p>
        </div>
        <div style="padding: 30px;">
          <h2 style="color: #1a1a1a; font-size: 18px; margin-top: 0;">Recuperação de Acesso</h2>
          <p style="font-size: 14px; color: #555; line-height: 1.5;">
            Recebemos uma solicitação para redefinir a senha do usuário associado ao e-mail: <strong>${email}</strong>.
          </p>
          <p style="font-size: 14px; color: #555; line-height: 1.5;">
            Clique no botão abaixo para cadastrar sua nova senha corporativa:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #006633; color: #ffffff; padding: 12px 28px; text-decoration: none; font-weight: bold; border-radius: 6px; font-size: 14px; display: inline-block;">Redefinir Minha Senha</a>
          </div>
          <p style="font-size: 12px; color: #888; border-top: 1px solid #eee; padding-top: 15px; margin-top: 25px;">
            Se você não solicitou a alteração de senha, ignore este e-mail. Seus dados permanecem seguros.
          </p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return res.json({
      success: true,
      message: 'Instruções de redefinição enviadas para o seu e-mail!'
    });
  } catch (error) {
    console.error('Erro ao enviar e-mail de recuperação:', error);
    return res.status(500).json({
      success: false,
      message: 'Falha ao enviar e-mail. Verifique se o endereço foi digitado corretamente ou contate o administrador.'
    });
  }
});

// API: Redefinição Efetiva de Senha
app.post('/api/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({ success: false, message: 'Usuário ou nova senha ausentes.' });
  }

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      'UPDATE public."MG_Usuarios" SET "senha" = $1 WHERE TRIM(LOWER("email")) = TRIM(LOWER($2));',
      [newPassword, email]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado na base.' });
    }

    return res.json({
      success: true,
      message: `Senha da conta ${email} alterada com sucesso!`
    });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    return res.status(500).json({ success: false, message: 'Erro ao atualizar a senha no banco de dados.' });
  } finally {
    if (client) client.release();
  }
});

// API: Retornar datas das últimas importações
app.get('/api/import/ultimas-datas', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS public."MG_Log_Importacoes" (
        "tipo" TEXT PRIMARY KEY,
        "data_importacao" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const result = await client.query('SELECT "tipo", "data_importacao" FROM public."MG_Log_Importacoes";');
    
    const datas = {};
    result.rows.forEach(r => {
      datas[r.tipo] = r.data_importacao;
    });

    return res.json({ success: true, datas });
  } catch (error) {
    console.error('Erro ao buscar datas de importação:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    if (client) client.release();
  }
});

// ==========================================
// API: AUTENTICAÇÃO DE LOGIN (100% via Supabase / PostgreSQL MG_Usuarios)
// ==========================================
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'E-mail e senha são obrigatórios.' });
  }

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      'SELECT "id", "nome", "email", "senha", "funcao", "revenda", "cod_vendedor", "ativo" FROM public."MG_Usuarios" WHERE TRIM(LOWER("email")) = TRIM(LOWER($1));',
      [username.trim()]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ success: false, message: 'E-mail ou senha incorretos.' });
    }

    const usuario = result.rows[0];

    if (!usuario.ativo) {
      return res.status(403).json({ success: false, message: 'Conta inativa. Entre em contato com o Administrador.' });
    }

    if (usuario.senha !== password) {
      return res.status(401).json({ success: false, message: 'E-mail ou senha incorretos.' });
    }

    return res.json({
      success: true,
      message: 'Bem-vindo ao sistema!',
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        funcao: usuario.funcao,
        revenda: usuario.revenda,
        cod_vendedor: usuario.cod_vendedor
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).json({ success: false, message: 'Erro interno ao autenticar usuário.' });
  } finally {
    if (client) client.release();
  }
});

// ==========================================
// CRUD: GERENCIAMENTO DE USUÁRIOS (MG_Usuarios)
// ==========================================
app.get('/api/usuarios', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(`
      SELECT "id", "nome", "email", "funcao", "revenda", "cod_vendedor", "ativo", "created_at"
      FROM public."MG_Usuarios"
      ORDER BY "id" ASC;
    `);
    return res.json({ success: true, usuarios: result.rows });
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    return res.status(500).json({ success: false, message: 'Erro ao buscar usuários: ' + error.message });
  } finally {
    if (client) client.release();
  }
});

app.post('/api/usuarios', async (req, res) => {
  const { nome, email, senha, funcao, revenda, cod_vendedor, ativo } = req.body;

  if (!nome || !email || !senha || !funcao) {
    return res.status(400).json({ success: false, message: 'Campos obrigatórios: Nome, E-mail, Senha e Função.' });
  }

  let client;
  try {
    client = await pool.connect();
    const checkEmail = await client.query('SELECT "id" FROM public."MG_Usuarios" WHERE TRIM(LOWER("email")) = TRIM(LOWER($1));', [email]);
    if (checkEmail.rowCount > 0) {
      return res.status(400).json({ success: false, message: 'O e-mail informado já está cadastrado.' });
    }

    const isAtivo = ativo !== undefined ? ativo : true;

    const result = await client.query(`
      INSERT INTO public."MG_Usuarios" ("nome", "email", "senha", "funcao", "revenda", "cod_vendedor", "ativo")
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING "id", "nome", "email", "funcao", "revenda", "cod_vendedor", "ativo";
    `, [nome.trim(), email.trim().toLowerCase(), senha, funcao, revenda || 'TODAS', cod_vendedor || null, isAtivo]);

    return res.json({ success: true, message: 'Usuário cadastrado com sucesso!', usuario: result.rows[0] });

  } catch (error) {
    console.error('Erro ao cadastrar usuário:', error);
    return res.status(500).json({ success: false, message: 'Erro ao cadastrar usuário: ' + error.message });
  } finally {
    if (client) client.release();
  }
});

app.put('/api/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, email, senha, funcao, revenda, cod_vendedor, ativo } = req.body;

  if (!nome || !email || !funcao) {
    return res.status(400).json({ success: false, message: 'Campos obrigatórios: Nome, E-mail e Função.' });
  }

  let client;
  try {
    client = await pool.connect();
    let queryText = '';
    let queryParams = [];

    if (senha && senha.trim() !== '') {
      queryText = `
        UPDATE public."MG_Usuarios"
        SET "nome" = $1, "email" = $2, "senha" = $3, "funcao" = $4, "revenda" = $5, "cod_vendedor" = $6, "ativo" = $7
        WHERE "id" = $8;
      `;
      queryParams = [nome.trim(), email.trim().toLowerCase(), senha, funcao, revenda || 'TODAS', cod_vendedor || null, ativo, id];
    } else {
      queryText = `
        UPDATE public."MG_Usuarios"
        SET "nome" = $1, "email" = $2, "funcao" = $3, "revenda" = $4, "cod_vendedor" = $5, "ativo" = $6
        WHERE "id" = $7;
      `;
      queryParams = [nome.trim(), email.trim().toLowerCase(), funcao, revenda || 'TODAS', cod_vendedor || null, ativo, id];
    }

    const result = await client.query(queryText, queryParams);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    return res.json({ success: true, message: 'Usuário atualizado com sucesso!' });

  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    return res.status(500).json({ success: false, message: 'Erro ao atualizar usuário: ' + error.message });
  } finally {
    if (client) client.release();
  }
});

app.patch('/api/usuarios/:id/status', async (req, res) => {
  const { id } = req.params;
  const { ativo } = req.body;

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      'UPDATE public."MG_Usuarios" SET "ativo" = $1 WHERE "id" = $2;',
      [ativo, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    return res.json({ success: true, message: `Status do usuário alterado para ${ativo ? 'Ativo' : 'Inativo'}.` });
  } catch (error) {
    console.error('Erro ao alterar status:', error);
    return res.status(500).json({ success: false, message: 'Erro ao alterar status: ' + error.message });
  } finally {
    if (client) client.release();
  }
});

// ==========================================
// 1. IMPORTAÇÃO: Base de Clientes (UPSERT)
// ==========================================
app.post('/api/import/clientes', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });

  const filePath = req.file.path;
  const originalName = req.file.originalname.toLowerCase();
  let client;

  try {
    client = await pool.connect();
    let registros = [];

    if (originalName.endsWith('.xlsx') || originalName.endsWith('.xls') || originalName.endsWith('.xlsm')) {
      const workbook = xlsx.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: null });

      registros = rawRows.map(row => {
        const obj = {};
        Object.keys(row).forEach(k => {
          const keyClean = k.trim();
          if (keyClean && !keyClean.startsWith('Unnamed:')) {
            obj[keyClean] = row[k] !== undefined ? row[k] : null;
          }
        });
        if (obj['Regiao'] && obj['Numero']) {
          obj['Cod_Completo'] = gerarCodCompleto(obj['Regiao'], obj['Numero']);
        }
        return obj;
      }).filter(r => r['Regiao'] && r['Numero']);

    } else {
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath, { encoding: 'latin1' })
          .pipe(csv({ separator: ';' }))
          .on('data', (row) => {
            const rowLimpa = {};
            Object.keys(row).forEach(k => {
              const keyTrimmed = k.trim();
              if (keyTrimmed && !keyTrimmed.startsWith('Unnamed:')) {
                rowLimpa[keyTrimmed] = row[k] !== undefined ? row[k] : null;
              }
            });

            if (rowLimpa['Regiao'] && rowLimpa['Numero']) {
              rowLimpa['Cod_Completo'] = gerarCodCompleto(rowLimpa['Regiao'], rowLimpa['Numero']);
              registros.push(rowLimpa);
            }
          })
          .on('end', resolve)
          .on('error', reject);
      });
    }

    if (registros.length === 0) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, message: 'Nenhum cliente válido encontrado.' });
    }

    await client.query('BEGIN');
    await client.query('ALTER TABLE public."MG_Base_Cli" ADD COLUMN IF NOT EXISTS "Cod_Completo" TEXT;');
    await client.query('CREATE TEMP TABLE temp_clientes (LIKE public."MG_Base_Cli" INCLUDING DEFAULTS) ON COMMIT DROP;');

    const colunas = Object.keys(registros[0]);
    for (const col of colunas) {
      await client.query(`ALTER TABLE public."MG_Base_Cli" ADD COLUMN IF NOT EXISTS "${col}" TEXT;`);
      await client.query(`ALTER TABLE temp_clientes ADD COLUMN IF NOT EXISTS "${col}" TEXT;`);
    }

    const colunasFormatadas = colunas.map(c => `"${c}"`).join(', ');
    const batchSize = Math.max(1, Math.floor(30000 / colunas.length));

    for (let i = 0; i < registros.length; i += batchSize) {
      const chunk = registros.slice(i, i + batchSize);
      const valuesPlaceholders = [];
      const flatParams = [];
      let paramIdx = 1;

      for (const reg of chunk) {
        const rowParams = colunas.map(c => reg[c] !== undefined ? reg[c] : null);
        valuesPlaceholders.push(`(${rowParams.map(() => `$${paramIdx++}`).join(', ')})`);
        flatParams.push(...rowParams);
      }

      await client.query(`INSERT INTO temp_clientes (${colunasFormatadas}) VALUES ${valuesPlaceholders.join(', ')}`, flatParams);
    }

    const setColumns = colunas
      .filter(c => c !== 'Regiao' && c !== 'Numero' && c !== 'Cod_Completo')
      .map(c => `"${c}" = t."${c}"`)
      .join(', ');

    const resUpdate = await client.query(`
      UPDATE public."MG_Base_Cli" c 
      SET ${setColumns} 
      FROM temp_clientes t 
      WHERE TRIM(c."Cod_Completo") = TRIM(t."Cod_Completo");
    `);

    const resInsert = await client.query(`
      INSERT INTO public."MG_Base_Cli" (${colunasFormatadas}) 
      SELECT ${colunasFormatadas} 
      FROM temp_clientes t 
      WHERE NOT EXISTS (
        SELECT 1 FROM public."MG_Base_Cli" c 
        WHERE TRIM(c."Cod_Completo") = TRIM(t."Cod_Completo")
      );
    `);

    await client.query('ALTER TABLE public."MG_Base_Cli_Ativ" ADD COLUMN IF NOT EXISTS "Cod_Completo" TEXT;');
    await client.query('TRUNCATE TABLE public."MG_Base_Cli_Ativ";');
    await client.query(`
      INSERT INTO public."MG_Base_Cli_Ativ"
      SELECT * FROM public."MG_Base_Cli"
      WHERE TRIM("Vend(1)") NOT IN ('90', '951', '952', '953', '954', '955', '956', '964', '965', '997', '999')
         OR "Vend(1)" IS NULL;
    `);

    await registrarUltimaImportacao(client, 'clientes');
    await client.query('COMMIT');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    return res.json({
      success: true,
      message: 'Base de Clientes sincronizada com sucesso!',
      totalLidos: registros.length,
      atualizados: resUpdate.rowCount,
      novos: resInsert.rowCount,
      inseridos: resInsert.rowCount
    });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return res.status(500).json({ success: false, message: 'Erro ao processar clientes: ' + error.message });
  } finally {
    if (client) client.release();
  }
});

// ==========================================
// API: Sincronizar Clientes Ativos
// ==========================================
app.post('/api/import/clientes-ativos', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('ALTER TABLE public."MG_Base_Cli_Ativ" ADD COLUMN IF NOT EXISTS "Cod_Completo" TEXT;');
    await client.query('TRUNCATE TABLE public."MG_Base_Cli_Ativ";');
    const result = await client.query(`
      INSERT INTO public."MG_Base_Cli_Ativ"
      SELECT * FROM public."MG_Base_Cli"
      WHERE TRIM("Vend(1)") NOT IN ('90', '951', '952', '953', '954', '955', '956', '964', '965', '997', '999')
         OR "Vend(1)" IS NULL;
    `);

    await registrarUltimaImportacao(client, 'clientes_ativos');
    await client.query('COMMIT');
    return res.json({ success: true, message: `Base ativa sincronizada! Total: ${result.rowCount} registros.` });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    return res.status(500).json({ success: false, message: 'Erro ao atualizar base ativa: ' + error.message });
  } finally {
    if (client) client.release();
  }
});

// ==========================================
// 2. IMPORTAÇÃO: Base de Produtos (UPSERT)
// ==========================================
app.post('/api/import/produtos', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
  const filePath = req.file.path;
  const originalName = req.file.originalname.toLowerCase();
  let client;

  try {
    client = await pool.connect();
    let registros = [];

    if (originalName.endsWith('.xlsx') || originalName.endsWith('.xls') || originalName.endsWith('.xlsm')) {
      const workbook = xlsx.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: null });

      registros = rawRows.map(row => {
        const obj = {};
        Object.keys(row).forEach(k => {
          const keyClean = k.trim();
          if (keyClean && !keyClean.startsWith('Unnamed:')) {
            obj[keyClean] = row[k] !== undefined && row[k] !== null ? String(row[k]) : null;
          }
        });
        return obj;
      }).filter(r => r['Reduzido']);

    } else {
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath, { encoding: 'latin1' })
          .pipe(csv({ separator: ';' }))
          .on('data', (row) => {
            const rowLimpa = {};
            Object.keys(row).forEach(k => {
              const keyTrimmed = k.trim();
              if (keyTrimmed && !keyTrimmed.startsWith('Unnamed:')) {
                rowLimpa[keyTrimmed] = row[k] !== undefined && row[k] !== null ? String(row[k]) : null;
              }
            });
            if (rowLimpa['Reduzido']) registros.push(rowLimpa);
          })
          .on('end', resolve)
          .on('error', reject);
      });
    }

    if (registros.length === 0) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, message: 'Nenhum produto válido encontrado.' });
    }

    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE temp_produtos (LIKE public."MG_Base_Prod" INCLUDING DEFAULTS) ON COMMIT DROP;');

    const colunas = Object.keys(registros[0]);
    for (const col of colunas) {
      await client.query(`ALTER TABLE public."MG_Base_Prod" ADD COLUMN IF NOT EXISTS "${col}" TEXT;`);
      await client.query(`ALTER TABLE temp_produtos ADD COLUMN IF NOT EXISTS "${col}" TEXT;`);
    }

    const colunasFormatadas = colunas.map(c => `"${c}"`).join(', ');
    const batchSize = Math.max(1, Math.floor(30000 / colunas.length));

    for (let i = 0; i < registros.length; i += batchSize) {
      const chunk = registros.slice(i, i + batchSize);
      const valuesPlaceholders = [];
      const flatParams = [];
      let paramIdx = 1;

      for (const reg of chunk) {
        const rowParams = colunas.map(c => reg[c] !== undefined ? reg[c] : null);
        valuesPlaceholders.push(`(${rowParams.map(() => `$${paramIdx++}`).join(', ')})`);
        flatParams.push(...rowParams);
      }

      await client.query(`INSERT INTO temp_produtos (${colunasFormatadas}) VALUES ${valuesPlaceholders.join(', ')}`, flatParams);
    }

    const setColumns = colunas
      .filter(c => c !== 'Reduzido')
      .map(c => `"${c}" = t."${c}"`)
      .join(', ');

    const resUpdate = await client.query(`
      UPDATE public."MG_Base_Prod" p 
      SET ${setColumns} 
      FROM temp_produtos t 
      WHERE TRIM(p."Reduzido") = TRIM(t."Reduzido");
    `);

    const resInsert = await client.query(`
      INSERT INTO public."MG_Base_Prod" (${colunasFormatadas}) 
      SELECT ${colunasFormatadas} 
      FROM temp_produtos t 
      WHERE NOT EXISTS (
        SELECT 1 FROM public."MG_Base_Prod" p 
        WHERE TRIM(p."Reduzido") = TRIM(t."Reduzido")
      );
    `);

    await registrarUltimaImportacao(client, 'produtos');
    await client.query('COMMIT');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    return res.json({
      success: true,
      message: 'Base de Produtos sincronizada com sucesso!',
      totalLidos: registros.length,
      atualizados: resUpdate.rowCount,
      novos: resInsert.rowCount,
      inseridos: resInsert.rowCount
    });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return res.status(500).json({ success: false, message: 'Erro ao processar produtos: ' + error.message });
  } finally {
    if (client) client.release();
  }
});

// ==========================================
// 3. IMPORTAÇÃO: Base Histórica (TRUNCATE + Cálculos)
// ==========================================
app.post('/api/import/historico-mastercross', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });

  const filePath = req.file.path;
  const originalName = req.file.originalname.toLowerCase();
  const isExcel = originalName.endsWith('.xlsx') || originalName.endsWith('.xls') || originalName.endsWith('.xlsm');
  let client;

  try {
    client = await pool.connect();
    let rawRows = [];

    if (isExcel) {
      const workbook = xlsx.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    } else {
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath, { encoding: 'latin1' })
          .pipe(csv({ separator: ';', headers: false }))
          .on('data', (row) => rawRows.push(Object.values(row)))
          .on('end', resolve)
          .on('error', reject);
      });
    }

    if (rawRows.length < 2) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, message: 'Arquivo sem dados suficientes.' });
    }

    const registrosParaInserir = [];

    for (let r = 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;

      let codClienteRaw = row[0] !== undefined && row[0] !== null ? String(row[0]).trim() : '';
      const codProduto = row[1] !== undefined && row[1] !== null ? String(row[1]).trim() : '';
      const descProduto = row[2] !== undefined && row[2] !== null ? String(row[2]).trim() : '';

      if (!codClienteRaw && !codProduto) continue;

      let codClientePadrao = codClienteRaw;
      if (codClienteRaw.includes('-')) {
        const partes = codClienteRaw.split('-');
        codClientePadrao = `${partes[0].padStart(4, '0')}-${partes[1].padStart(4, '0')}`;
      } else if (codClienteRaw.length >= 5) {
        const reg = codClienteRaw.substring(0, codClienteRaw.length - 4);
        const num = codClienteRaw.substring(codClienteRaw.length - 4);
        codClientePadrao = `${reg.padStart(4, '0')}-${num.padStart(4, '0')}`;
      }

      const mesesVal = [];
      for (let i = 3; i < 9; i++) {
        const rawVal = row[i];
        let val = 0;
        if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
          if (typeof rawVal === 'number') {
            val = rawVal;
          } else {
            const parsed = parseFloat(String(rawVal).replace(',', '.'));
            val = isNaN(parsed) ? 0 : parsed;
          }
        }
        mesesVal.push(val);
      }

      const soma6Meses = mesesVal.reduce((acc, curr) => acc + curr, 0);
      const media = soma6Meses / 6.0;
      const maximo = Math.max(...mesesVal);
      const mediaMedia = (media + maximo) / 2.0;

      registrosParaInserir.push([
        codClientePadrao,
        codProduto,
        descProduto,
        mesesVal[0],
        mesesVal[1],
        mesesVal[2],
        mesesVal[3],
        mesesVal[4],
        mesesVal[5],
        media,
        maximo,
        mediaMedia
      ]);
    }

    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public."MG_Base_Hist" (
        "Codigo_Cliente" TEXT,
        "Codigo_Produto" TEXT,
        "Descricao_Produto" TEXT,
        "Mes_01" NUMERIC(15, 4) DEFAULT 0,
        "Mes_02" NUMERIC(15, 4) DEFAULT 0,
        "Mes_03" NUMERIC(15, 4) DEFAULT 0,
        "Mes_04" NUMERIC(15, 4) DEFAULT 0,
        "Mes_05" NUMERIC(15, 4) DEFAULT 0,
        "Mes_06" NUMERIC(15, 4) DEFAULT 0,
        "Media" NUMERIC(15, 4) DEFAULT 0,
        "Maximo" NUMERIC(15, 4) DEFAULT 0,
        "Media_Media" NUMERIC(15, 4) DEFAULT 0
      );
    `);

    await client.query('TRUNCATE TABLE public."MG_Base_Hist";');

    const batchSize = Math.max(1, Math.floor(30000 / 12));
    for (let i = 0; i < registrosParaInserir.length; i += batchSize) {
      const chunk = registrosParaInserir.slice(i, i + batchSize);
      const valuesPlaceholders = [];
      const flatParams = [];
      let paramIdx = 1;

      for (const item of chunk) {
        valuesPlaceholders.push(`(${item.map(() => `$${paramIdx++}`).join(', ')})`);
        flatParams.push(...item);
      }

      await client.query(`
        INSERT INTO public."MG_Base_Hist" (
          "Codigo_Cliente", "Codigo_Produto", "Descricao_Produto",
          "Mes_01", "Mes_02", "Mes_03", "Mes_04", "Mes_05", "Mes_06",
          "Media", "Maximo", "Media_Media"
        ) VALUES ${valuesPlaceholders.join(', ')}
      `, flatParams);
    }

    await registrarUltimaImportacao(client, 'historico');
    await client.query('COMMIT');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    return res.json({
      success: true,
      message: 'Base Histórica importada com sucesso!',
      totalLidos: registrosParaInserir.length,
      atualizados: 0,
      novos: registrosParaInserir.length,
      inseridos: registrosParaInserir.length
    });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return res.status(500).json({ success: false, message: 'Erro ao processar base histórica: ' + error.message });
  } finally {
    if (client) client.release();
  }
});

// ==========================================
// 4. IMPORTAÇÃO: Metas da CIA Volume (TRUNCATE + RESET DA TABELA DISTRIBUÍDA)
// ==========================================
app.post('/api/import/metas-cia-volume', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
  const filePath = req.file.path;
  const originalName = req.file.originalname.toLowerCase();
  const isExcel = originalName.endsWith('.xlsx') || originalName.endsWith('.xls') || originalName.endsWith('.xlsm');
  let client;

  try {
    client = await pool.connect();
    let rawRows = [];

    if (isExcel) {
      const workbook = xlsx.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rawRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    } else {
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath, { encoding: 'latin1' })
          .pipe(csv({ separator: ';' }))
          .on('data', (row) => rawRows.push(row))
          .on('end', resolve)
          .on('error', reject);
      });
    }

    if (rawRows.length === 0) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, message: 'Arquivo vazio.' });
    }

    const registrosLimpos = rawRows.map(row => {
      const obj = {};
      Object.keys(row).forEach(k => obj[k.trim().toUpperCase()] = row[k]);
      return obj;
    });

    const registrosParaInserir = [];

    for (const r of registrosLimpos) {
      const material = r['MATERIAL'] !== undefined ? String(r['MATERIAL']).trim() : '';
      const descMaterial = r['DESCRIÇÃO MATERIAL'] || r['DESCRICAO MATERIAL'] || '';
      const familia = r['FAMÍLIA'] || r['FAMILIA'] || '';
      const embalagem = r['EMBALAGEM'] || '';
      const packtype = r['PACKTYPE'] || '';
      const brand = r['BRAND'] || '';
      const marca = r['MARCA'] || '';
      const sabor = r['SABOR'] || '';
      const canal = r['CANAL'] || '';
      const cliente = r['CLIENTE'] !== undefined ? String(r['CLIENTE']).trim() : '';
      const descCliente = r['DESCRIÇÃO CLIENTE'] || r['DESCRICAO CLIENTE'] || '';
      const uf = r['UF'] || '';
      const diretoria = r['DIRETORIA'] || '';

      let metaVal = 0;
      const rawMeta = r['META'];
      if (rawMeta !== undefined && rawMeta !== null && rawMeta !== '') {
        if (typeof rawMeta === 'number') metaVal = rawMeta;
        else {
          const parsed = parseFloat(String(rawMeta).replace(',', '.'));
          metaVal = isNaN(parsed) ? 0 : parsed;
        }
      }

      if (material || descMaterial) {
        registrosParaInserir.push([
          material, descMaterial, familia, embalagem, packtype,
          brand, marca, sabor, canal, cliente, descCliente,
          uf, diretoria, metaVal
        ]);
      }
    }

    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE public."MG_Meta_Vol_Cia";');
    await client.query('CREATE TABLE IF NOT EXISTS public."MG_Meta_Vol_Distribuida" ("Revenda" TEXT, "Material" TEXT, "Vendedor" TEXT, "Volume" NUMERIC(15, 4), PRIMARY KEY ("Revenda", "Material", "Vendedor"));');
    await client.query('TRUNCATE TABLE public."MG_Meta_Vol_Distribuida";');

    const batchSize = Math.max(1, Math.floor(30000 / 14));
    for (let i = 0; i < registrosParaInserir.length; i += batchSize) {
      const chunk = registrosParaInserir.slice(i, i + batchSize);
      const valuesPlaceholders = [];
      const flatParams = [];
      let paramIdx = 1;

      for (const item of chunk) {
        valuesPlaceholders.push(`(${item.map(() => `$${paramIdx++}`).join(', ')})`);
        flatParams.push(...item);
      }

      await client.query(`
        INSERT INTO public."MG_Meta_Vol_Cia" (
          "Material", "Descricao_Material", "Familia", "Embalagem", "Packtype",
          "Brand", "Marca", "Sabor", "Canal", "Cliente", "Descricao_Cliente",
          "UF", "Diretoria", "Meta"
        ) VALUES ${valuesPlaceholders.join(', ')}
      `, flatParams);
    }

    await registrarUltimaImportacao(client, 'metas_cia_volume');
    await client.query('COMMIT');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    return res.json({
      success: true,
      message: 'Meta de Volume da CIA importada com sucesso! As metas distribuídas foram resetadas para recálculo.',
      totalLidos: registrosParaInserir.length,
      atualizados: 0,
      novos: registrosParaInserir.length,
      inseridos: registrosParaInserir.length
    });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return res.status(500).json({ success: false, message: 'Erro ao processar: ' + error.message });
  } finally {
    if (client) client.release();
  }
});

// ==========================================
// 5. IMPORTAÇÃO: Metas de Cobertura CIA (Consolidação de Múltiplas Abas)
// ==========================================
app.post('/api/import/metas-cia-cobertura', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
  }

  const filePath = req.file.path;
  let client;

  try {
    client = await pool.connect();

    const workbook = xlsx.readFile(filePath);
    const registrosConsolidados = [];

    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

      rawRows.forEach(r => {
        const obj = {};
        Object.keys(r).forEach(k => {
          obj[k.trim().toUpperCase()] = r[k];
        });

        const cliente = obj['CLIENTE'] !== undefined ? String(obj['CLIENTE']).trim() : '';
        const material = obj['MATERIAL'] !== undefined ? String(obj['MATERIAL']).trim() : '';
        const familia = obj['FAMÍLIA'] || obj['FAMILIA'] || '';
        const embalagem = obj['EMBALAGEM'] || '';
        const packtype = obj['PACKTYPE'] || obj['PACKTYPE '] || '';
        const marca = obj['MARCA'] || '';
        const sabor = obj['SABOR'] || '';

        let metaVal = 0;
        const rawMeta = obj['META'];
        if (rawMeta !== undefined && rawMeta !== null && rawMeta !== '') {
          if (typeof rawMeta === 'number') {
            metaVal = rawMeta;
          } else {
            const parsed = parseFloat(String(rawMeta).replace(',', '.'));
            metaVal = isNaN(parsed) ? 0 : parsed;
          }
        }

        if (cliente || material) {
          registrosConsolidados.push([
            cliente,
            material,
            familia,
            embalagem,
            packtype,
            marca,
            sabor,
            metaVal
          ]);
        }
      });
    });

    if (registrosConsolidados.length === 0) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, message: 'Nenhum dado válido encontrado nas abas da planilha.' });
    }

    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS public."MG_Meta_Cob_Cia" (
        "Cliente" TEXT,
        "Material" TEXT,
        "Familia" TEXT,
        "Embalagem" TEXT,
        "Packtype" TEXT,
        "Marca" TEXT,
        "Sabor" TEXT,
        "Meta" NUMERIC(15, 4),
        "Data_Importacao" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query('TRUNCATE TABLE public."MG_Meta_Cob_Cia";');

    const batchSize = Math.max(1, Math.floor(30000 / 8));
    for (let i = 0; i < registrosConsolidados.length; i += batchSize) {
      const chunk = registrosConsolidados.slice(i, i + batchSize);
      const valuesPlaceholders = [];
      const flatParams = [];
      let paramIdx = 1;

      for (const item of chunk) {
        valuesPlaceholders.push(`(${item.map(() => `$${paramIdx++}`).join(', ')})`);
        flatParams.push(...item);
      }

      await client.query(`
        INSERT INTO public."MG_Meta_Cob_Cia" (
          "Cliente", "Material", "Familia", "Embalagem", "Packtype", "Marca", "Sabor", "Meta"
        ) VALUES ${valuesPlaceholders.join(', ')}
      `, flatParams);
    }

    await registrarUltimaImportacao(client, 'metas_cia_cobertura');

    await client.query('COMMIT');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    return res.json({
      success: true,
      message: `Meta de Cobertura da CIA importada com sucesso! ${registrosConsolidados.length} registros inseridos das ${workbook.SheetNames.length} abas.`,
      totalLidos: registrosConsolidados.length,
      atualizados: 0,
      novos: registrosConsolidados.length,
      inseridos: registrosConsolidados.length
    });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    console.error('Erro na importação de cobertura:', error);
    return res.status(500).json({ success: false, message: 'Erro ao processar arquivo: ' + error.message });
  } finally {
    if (client) client.release();
  }
});

// ==========================================
// 6. CONSULTA DE METAS: Distribuição Proporcional (Alocação Exata de 100%)
// ==========================================
app.get('/api/metas/volume', async (req, res) => {
  const codRevenda = req.query.revenda || '10';
  const clienteCia = MAPA_REVENDA_CLIENTECIA[codRevenda] || '208490';
  const listaVendedores = MAPA_REVENDA_VENDEDORES[codRevenda] || MAPA_REVENDA_VENDEDORES['10'];

  let client;

  try {
    client = await pool.connect();

    const queryMetasCia = await client.query(`
      SELECT 
        TRIM(m."Material") AS "Material",
        MAX(m."Descricao_Material") AS "Descricao_Material",
        MAX(m."Familia") AS "Familia",
        MAX(m."Marca") AS "Marca",
        MAX(m."Sabor") AS "Sabor",
        ROUND(SUM(m."Meta")) AS "Meta_Total",
        COALESCE(
          MAX(
            NULLIF(
              CAST(REPLACE(TRIM(p."Fat.Conv1"), ',', '.') AS NUMERIC), 
              0
            )
          ), 
          1
        ) AS "Fat_Conv_1"
      FROM public."MG_Meta_Vol_Cia" m
      LEFT JOIN public."MG_Base_Prod" p 
        ON LTRIM(TRIM(p."Reduzido"), '0') = LTRIM(TRIM(m."Material"), '0')
      WHERE TRIM(m."Cliente") = $1 AND m."Meta" IS NOT NULL AND m."Meta" > 0
      GROUP BY TRIM(m."Material")
      HAVING SUM(m."Meta") > 0
      ORDER BY TRIM(m."Material") ASC;
    `, [clienteCia]);

    const querySomaMediaMedia = await client.query(`
      SELECT 
        LTRIM(TRIM(c."Vend(1)"), '0') AS vendedor,
        TRIM(h."Codigo_Produto") AS material,
        ROUND(SUM(h."Media_Media")) AS soma_potencial
      FROM public."MG_Base_Hist" h
      INNER JOIN public."MG_Base_Cli_Ativ" c 
        ON TRIM(c."Cod_Completo") = TRIM(h."Codigo_Cliente")
      WHERE LTRIM(TRIM(c."Vend(1)"), '0') = ANY($1)
      GROUP BY LTRIM(TRIM(c."Vend(1)"), '0'), TRIM(h."Codigo_Produto");
    `, [listaVendedores]);

    const mapaMediaMedia = {};
    querySomaMediaMedia.rows.forEach(r => {
      const mat = String(r.material).trim();
      const vend = String(r.vendedor).trim();
      const soma = Math.round(parseFloat(r.soma_potencial || 0));

      if (!mapaMediaMedia[mat]) mapaMediaMedia[mat] = {};
      mapaMediaMedia[mat][vend] = soma;
    });

    const querySalvas = await client.query(`
      SELECT "Material", "Vendedor", "Volume"
      FROM public."MG_Meta_Vol_Distribuida"
      WHERE "Revenda" = $1;
    `, [codRevenda]);

    const salvasMap = {};
    querySalvas.rows.forEach(r => {
      salvasMap[`${r.Material}_${r.Vendedor}`] = Math.round(parseFloat(r.Volume || 0));
    });

    const produtosCalculados = queryMetasCia.rows
      .map(p => {
        const mat = String(p.Material).trim();
        const metaTotalCia = Math.round(parseFloat(p.Meta_Total || 0));

        if (metaTotalCia <= 0) return null;

        const fatConv1 = parseFloat(p.Fat_Conv_1 || 1);
        const umbArredondado = fatConv1 > 0 ? Math.ceil(metaTotalCia / fatConv1) : metaTotalCia;
        const metaAlvo = umbArredondado;
        const metasVendedores = {};

        let temSalva = false;
        listaVendedores.forEach(v => {
          if (salvasMap[`${mat}_${v}`] !== undefined) temSalva = true;
        });

        if (temSalva) {
          listaVendedores.forEach(v => {
            metasVendedores[v] = salvasMap[`${mat}_${v}`] !== undefined ? salvasMap[`${mat}_${v}`] : 0;
          });
        } else {
          let somaPotencialMesa = 0;
          listaVendedores.forEach(v => {
            somaPotencialMesa += (mapaMediaMedia[mat] && mapaMediaMedia[mat][v]) ? mapaMediaMedia[mat][v] : 0;
          });

          const rankingVendedores = [...listaVendedores].sort((a, b) => {
            const potA = (mapaMediaMedia[mat] && mapaMediaMedia[mat][a]) ? mapaMediaMedia[mat][a] : 0;
            const potB = (mapaMediaMedia[mat] && mapaMediaMedia[mat][b]) ? mapaMediaMedia[mat][b] : 0;
            return potB - potA;
          });

          let totalAlocado = 0;

          listaVendedores.forEach(v => {
            const pot = (mapaMediaMedia[mat] && mapaMediaMedia[mat][v]) ? mapaMediaMedia[mat][v] : 0;

            if (somaPotencialMesa > 0) {
              metasVendedores[v] = Math.floor(metaAlvo * (pot / somaPotencialMesa));
            } else {
              metasVendedores[v] = Math.floor(metaAlvo / (listaVendedores.length || 1));
            }
            totalAlocado += metasVendedores[v];
          });

          let diferenca = metaAlvo - totalAlocado;
          let idx = 0;

          while (diferenca > 0 && rankingVendedores.length > 0) {
            const vendAtual = rankingVendedores[idx % rankingVendedores.length];
            metasVendedores[vendAtual] += 1;
            diferenca--;
            idx++;
          }
        }

        return {
          ...p,
          Meta_Total: metaTotalCia,
          umb_arredondado: umbArredondado,
          metasVendedores
        };
      })
      .filter(p => p !== null && p.Meta_Total > 0);

    return res.json({
      success: true,
      gerente: codRevenda,
      vendedores: listaVendedores,
      produtos: produtosCalculados
    });

  } catch (error) {
    console.error('Erro ao buscar metas:', error);
    return res.status(500).json({ success: false, message: 'Erro ao carregar dados: ' + error.message });
  } finally {
    if (client) client.release();
  }
});

// ==========================================
// 7. SALVAR DISTRIBUIÇÃO DE METAS
// ==========================================
app.post('/api/metas/volume/salvar', async (req, res) => {
  const { revenda, distribuicao } = req.body; 
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public."MG_Meta_Vol_Distribuida" (
        "Revenda" TEXT,
        "Material" TEXT,
        "Vendedor" TEXT,
        "Volume" NUMERIC(15, 4),
        PRIMARY KEY ("Revenda", "Material", "Vendedor")
      );
    `);

    for (const item of distribuicao) {
      await client.query(`
        INSERT INTO public."MG_Meta_Vol_Distribuida" ("Revenda", "Material", "Vendedor", "Volume")
        VALUES ($1, $2, $3, $4)
        ON CONFLICT ("Revenda", "Material", "Vendedor") DO UPDATE SET "Volume" = EXCLUDED."Volume";
      `, [revenda, item.material, item.vendedor, Math.round(item.volume || 0)]);
    }

    await client.query('COMMIT');
    return res.json({ success: true, message: 'Metas salvas com sucesso!' });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    return res.status(500).json({ success: false, message: 'Erro ao salvar metas: ' + error.message });
  } finally {
    if (client) client.release();
  }
});

// ==========================================
// 8. EXPORTAÇÃO: Gerar Dados no formato METAS OUT.csv
// ==========================================
app.get('/api/metas/volume/exportar', async (req, res) => {
  let client;
  try {
    client = await pool.connect();

    const dataAtual = new Date();
    const anoVigente = String(dataAtual.getFullYear());
    const mesVigente = String(dataAtual.getMonth() + 1).padStart(2, '0');

    const ano = req.query.ano || anoVigente;
    const mes = req.query.mes ? String(req.query.mes).padStart(2, '0') : mesVigente;

    const todasRevendas = ['10', '20', '30', '40', '50', '60'];
    let todosVendedores = [];
    todasRevendas.forEach(rev => {
      if (MAPA_REVENDA_VENDEDORES[rev]) {
        todosVendedores.push(...MAPA_REVENDA_VENDEDORES[rev]);
      }
    });

    todosVendedores.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    const queryProdutos = await client.query(`
      SELECT 
        TRIM(m."Material") AS "Material",
        ROUND(SUM(m."Meta")) AS "Meta_Total"
      FROM public."MG_Meta_Vol_Cia" m
      WHERE m."Meta" IS NOT NULL AND m."Meta" > 0
      GROUP BY TRIM(m."Material")
      HAVING SUM(m."Meta") > 0
      ORDER BY TRIM(m."Material") ASC;
    `);

    const querySalvas = await client.query(`
      SELECT "Material", "Vendedor", "Volume"
      FROM public."MG_Meta_Vol_Distribuida";
    `);

    const salvasMap = {};
    querySalvas.rows.forEach(r => {
      const mat = String(r.Material).trim();
      const vend = String(r.Vendedor).trim();
      salvasMap[`${mat}_${vend}`] = Math.round(parseFloat(r.Volume || 0));
    });

    const exportRows = [];
    const layoutHeader = '9999;99;XXX;999999;999999999;99;99999;9999999;";"';

    todosVendedores.forEach(vend => {
      const vendClean = String(vend).trim();
      const vendPadrao = vendClean.padStart(3, '0');

      queryProdutos.rows.forEach(prod => {
        const matClean = String(prod.Material).trim();
        const materialPadrao = matClean.padStart(6, '0');
        const metaCia = Math.round(parseFloat(prod.Meta_Total || 0));

        if (metaCia > 0) {
          const metaVend = salvasMap[`${matClean}_${vendClean}`] !== undefined 
            ? salvasMap[`${matClean}_${vendClean}`] 
            : 0;

          exportRows.push({
            ano,
            mes,
            vendedor: vendPadrao,
            material: materialPadrao,
            metaVendedor: metaVend,
            campo5: 0,
            campo6: 0,
            metaCia: metaCia,
            linhaFormatada: `${ano};${mes};${vendPadrao};${materialPadrao};${metaVend};0;0;${metaCia};";"`
          });
        }
      });
    });

    const csvContent = [layoutHeader, ...exportRows.map(r => r.linhaFormatada)].join('\n');
    const nomeArquivo = `Meta_Vol_${ano}_${mes}.csv`;

    return res.json({
      success: true,
      ano,
      mes,
      nomeArquivo,
      totalRegistros: exportRows.length,
      dados: exportRows,
      csvText: csvContent
    });

  } catch (error) {
    console.error('Erro ao gerar exportação:', error);
    return res.status(500).json({ success: false, message: 'Erro ao gerar dados de exportação: ' + error.message });
  } finally {
    if (client) client.release();
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor MEGA GIRO rodando em: http://localhost:${PORT}\n`);
});