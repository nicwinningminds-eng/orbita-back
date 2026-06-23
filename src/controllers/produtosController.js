import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../data/db.js';
import { processarUploadImagem } from '../middlewares/uploadImagem.js';

export async function listar(req, res) {
  try {
    const db = await getDatabase();

    const produtos = await db.all(
      'SELECT * FROM produtos WHERE id_usuario = ?',
      [req.usuarioId]
    );

    res.json(produtos);
  } catch (erro) {
    console.error('[produtos.listar]', erro);
    res.status(500).json({
      mensagem: 'Erro ao listar produtos.'
    });
  }
}

export async function buscarPorId(req, res) {
  const { id } = req.params;

  try {
    const db = await getDatabase();

    const produto = await db.get(
      'SELECT * FROM produtos WHERE id = ?',
      [id]
    );

    if (!produto) {
      return res.status(404).json({
        mensagem: 'Produto não encontrado.'
      });
    }

    if (produto.id_usuario !== req.usuarioId) {
      return res.status(403).json({
        mensagem: 'Você não tem permissão para visualizar este produto.'
      });
    }

    res.json(produto);
  } catch (erro) {
    console.error('[produtos.buscarPorId]', erro);
    res.status(500).json({
      mensagem: 'Erro ao buscar produto.'
    });
  }
}


export async function criar(req, res) {
  const {
    nome,
    preco
  } = req.body;

  if (!nome || preco === undefined) {
    return res.status(400).json({
      mensagem: 'Campos obrigatórios ausentes.'
    });
  }

  try {
    const db = await getDatabase();

    const resultado = await db.run(
      `INSERT INTO produtos
       (nome, preco, id_usuario)
       VALUES (?, ?, ?)`,
      [
        nome,
        preco,
        req.usuarioId
      ]
    );

     const demandaId = resultado.lastID;

    // 2. cria produtos vinculados
    if (Array.isArray(produtos)) {
      for (const item of produtos) {
        await db.run(
          `INSERT INTO demanda_produtos (demanda_id, produto_id, quantidade)
           VALUES (?, ?, ?)`,
          [
            demandaId,
            item.produto_id,
            item.quantidade || 1
          ]
        );
      }
    }

    res.status(201).json({
      id: resultado.lastID,
      nome,
      preco,
      id_usuario: req.usuarioId
    });

  } catch (erro) {
    console.error('[produtos.criar]', erro);

    res.status(500).json({
      mensagem: 'Erro ao salvar produto.'
    });
  }
}


export async function atualizar(req, res) {
  const idProduto = Number(req.params.id);

  try {
    const db = await getDatabase();

    const atual = await db.get(
      'SELECT * FROM produtos WHERE id = ?',
      [idProduto]
    );

    if (!atual) {
      return res.status(404).json({
        mensagem: 'Produto não encontrado.'
      });
    }

    if (atual.id_usuario !== req.usuarioId) {
      return res.status(403).json({
        mensagem: 'Você só pode editar seus próprios produtos.'
      });
    }

    const novoNome = req.body.nome ?? atual.nome;
    const novoPreco = req.body.preco ?? atual.preco;

    await db.run(
      `UPDATE produtos
       SET nome = ?,
           preco = ?
       WHERE id = ?`,
      [
        novoNome,
        novoPreco,
        idProduto
      ]
    );

    res.json({
      id: idProduto,
      nome: novoNome,
      preco: novoPreco
    });

  } catch (erro) {
    console.error('[produtos.atualizar]', erro);

    res.status(500).json({
      mensagem: 'Erro ao atualizar produto.'
    });
  }
}

export async function remover(req, res) {
  const idProduto = Number(req.params.id);

  try {
    const db = await getDatabase();

    const produto = await db.get(
      'SELECT * FROM produtos WHERE id = ?',
      [idProduto]
    );

    if (!produto) {
      return res.status(404).json({
        mensagem: 'Produto não encontrado.'
      });
    }

    if (produto.id_usuario !== req.usuarioId) {
      return res.status(403).json({
        mensagem: 'Você só pode remover seus próprios produtos.'
      });
    }

    const resultado = await db.run(
      'DELETE FROM produtos WHERE id = ?',
      [idProduto]
    );

    if (resultado.changes === 0) {
      return res.status(404).json({
        mensagem: 'Produto não encontrado.'
      });
    }

    res.json({
      mensagem: 'Produto removido com sucesso.'
    });

  } catch (erro) {
    console.error('[produtos.remover]', erro);

    res.status(500).json({
      mensagem: 'Erro ao remover produto.'
    });
  }
}
