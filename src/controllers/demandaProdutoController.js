import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../data/db.js';
import { processarUploadImagem } from '../middlewares/uploadImagem.js';

export async function listar(req, res) {
  try {
    const db = await getDatabase();

    const registros = await db.all(`
      SELECT
        d.id,
        d.nome_cliente,
        d.descricao,
        d.prioridade,
        d.status,
        d.data_criacao,

        p.id AS produto_id,
        p.nome AS produto_nome,
        p.descricao AS produto_descricao,
        p.preco AS produto_preco

      FROM demandas d

      LEFT JOIN demanda_produto dp
        ON d.id = dp.id_demanda

      LEFT JOIN produtos p
        ON dp.id_produto = p.id

      WHERE d.id_usuario = ?

      ORDER BY d.id DESC
    `, [req.usuarioId]);

    const demandasMap = {};

    for (const item of registros) {

      if (!demandasMap[item.id]) {
        demandasMap[item.id] = {
          id: item.id,
          nome_cliente: item.nome_cliente,
          descricao: item.descricao,
          prioridade: item.prioridade,
          status: item.status,
          data_criacao: item.data_criacao,
          produtos: []
        };
      }

      if (item.produto_id) {
        demandasMap[item.id].produtos.push({
          id: item.produto_id,
          nome: item.produto_nome,
          descricao: item.produto_descricao,
          preco: item.produto_preco
        });
      }
    }

    res.json(Object.values(demandasMap));

  } catch (erro) {
    console.error('[demandas.listar]', erro);

    res.status(500).json({
      mensagem: 'Erro ao listar demandas.'
    });
  }
}

export async function buscarPorId(req, res) {
  const idDemanda = Number(req.params.id);

  try {
    const db = await getDatabase();

    const registros = await db.all(`
      SELECT
        d.id,
        d.id_usuario,
        d.nome_cliente,
        d.descricao,
        d.prioridade,
        d.status,
        d.data_criacao,

        p.id AS produto_id,
        p.nome AS produto_nome,
        p.descricao AS produto_descricao,
        p.preco AS produto_preco

      FROM demandas d

      LEFT JOIN demanda_produto dp
        ON d.id = dp.id_demanda

      LEFT JOIN produtos p
        ON dp.id_produto = p.id

      WHERE d.id = ?
    `, [idDemanda]);

    if (registros.length === 0) {
      return res.status(404).json({
        mensagem: 'Demanda não encontrada.'
      });
    }

    // Verifica se a demanda pertence ao usuário logado
    if (registros[0].id_usuario !== req.usuarioId) {
      return res.status(403).json({
        mensagem: 'Você não tem permissão para visualizar esta demanda.'
      });
    }

    const demanda = {
      id: registros[0].id,
      nome_cliente: registros[0].nome_cliente,
      descricao: registros[0].descricao,
      prioridade: registros[0].prioridade,
      status: registros[0].status,
      data_criacao: registros[0].data_criacao,
      produtos: []
    };

    for (const item of registros) {
      if (item.produto_id) {
        demanda.produtos.push({
          id: item.produto_id,
          nome: item.produto_nome,
          descricao: item.produto_descricao,
          preco: item.produto_preco
        });
      }
    }

    res.json(demanda);

  } catch (erro) {
    console.error('[demandas.buscarPorId]', erro);

    res.status(500).json({
      mensagem: 'Erro ao buscar demanda.'
    });
  }
}

export async function criar(req, res) {
  const {
    demanda_id,
    produto_id,
    quantidade,
    valor_unitario,
    observacao
  } = req.body;

  if (!demanda_id || !produto_id) {
    return res.status(400).json({
      mensagem: 'demanda_id e produto_id são obrigatórios.'
    });
  }

  try {
    const db = await getDatabase();

    const demanda = await db.get(
      'SELECT * FROM demandas WHERE id = ?',
      [demanda_id]
    );

    if (!demanda) {
      return res.status(404).json({
        mensagem: 'Demanda não encontrada.'
      });
    }

    if (demanda.id_usuario !== req.usuarioId) {
      return res.status(403).json({
        mensagem: 'Você não pode alterar demandas de outro usuário.'
      });
    }

    const resultado = await db.run(
      `INSERT INTO demanda_produtos
       (
         demanda_id,
         produto_id,
         quantidade,
         valor_unitario,
         observacao
       )
       VALUES (?, ?, ?, ?, ?)`,
      [
        demanda_id,
        produto_id,
        quantidade || 1,
        valor_unitario || null,
        observacao || null
      ]
    );

    return res.status(201).json({
      id: resultado.lastID,
      demanda_id,
      produto_id,
      quantidade,
      valor_unitario,
      observacao
    });

  } catch (erro) {
    console.error('[demanda_produtos.criar]', erro);

    return res.status(500).json({
      mensagem: 'Erro ao criar relacionamento.'
    });
  }
}

export async function atualizar(req, res) {
  const idDemanda = Number(req.params.id);

  const {
    nome_cliente,
    descricao,
    prioridade,
    status,
    produtos
  } = req.body;

  try {
    const db = await getDatabase();

    const demanda = await db.get(
      'SELECT * FROM demandas WHERE id = ?',
      [idDemanda]
    );

    if (!demanda) {
      return res.status(404).json({
        mensagem: 'Demanda não encontrada.'
      });
    }

    if (demanda.id_usuario !== req.usuarioId) {
      return res.status(403).json({
        mensagem: 'Você só pode editar suas próprias demandas.'
      });
    }

    const novoNomeCliente = nome_cliente ?? demanda.nome_cliente;
    const novaDescricao = descricao ?? demanda.descricao;
    const novaPrioridade = prioridade ?? demanda.prioridade;
    const novoStatus = status ?? demanda.status;

    await db.run(
      `UPDATE demandas
       SET nome_cliente = ?,
           descricao = ?,
           prioridade = ?,
           status = ?
       WHERE id = ?`,
      [
        novoNomeCliente,
        novaDescricao,
        novaPrioridade,
        novoStatus,
        idDemanda
      ]
    );

    // Atualiza os produtos da demanda
    if (Array.isArray(produtos)) {

      // Remove os vínculos antigos
      await db.run(
        'DELETE FROM demanda_produto WHERE id_demanda = ?',
        [idDemanda]
      );

      // Cria os novos vínculos
      for (const idProduto of produtos) {
        await db.run(
          `INSERT INTO demanda_produto
           (id_demanda, id_produto)
           VALUES (?, ?)`,
          [idDemanda, idProduto]
        );
      }
    }

    res.json({
      mensagem: 'Demanda atualizada com sucesso.'
    });

  } catch (erro) {
    console.error('[demandas.atualizar]', erro);

    res.status(500).json({
      mensagem: 'Erro ao atualizar demanda.'
    });
  }
}
