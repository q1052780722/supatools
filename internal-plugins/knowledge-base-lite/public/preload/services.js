var path = require('path')
var fs = require('fs')

var docsDir = path.resolve(__dirname, '..', 'docs')

function readDocs() {
  if (!fs.existsSync(docsDir)) {
    throw new Error('docs 目录不存在: ' + docsDir)
  }
  var files = fs.readdirSync(docsDir).filter(function (f) {
    return f.endsWith('.md')
  })
  if (files.length === 0) {
    throw new Error('docs 目录中没有 .md 文件，请先放入知识文档')
  }

  var docs = []
  for (var i = 0; i < files.length; i++) {
    var content = fs.readFileSync(path.join(docsDir, files[i]), 'utf-8')
    docs.push({
      filename: files[i],
      content: content
    })
  }
  return docs
}

function buildContext(docs) {
  var parts = []
  for (var i = 0; i < docs.length; i++) {
    parts.push('## ' + docs[i].filename.replace(/\.md$/, '') + '\n\n' + docs[i].content)
  }
  return parts.join('\n\n---\n\n')
}

function ask(query, onChunk) {
  var docs
  try {
    docs = readDocs()
  } catch (e) {
    throw new Error('读取知识文档失败: ' + (e.message || '未知错误'))
  }

  var contextText = buildContext(docs)

  var systemPrompt =
    '你是知识库检索助手。请严格根据以下参考资料回答用户问题。\n\n规则：\n1. 只输出参考资料中已有的内容，禁止添加参考资料之外的任何知识、示例、代码或建议\n2. 禁止使用表格、代码块等格式，用纯文本组织答案\n3. 如果参考资料已覆盖问题，直接复述资料中的步骤/方法，不要补充解释\n4. 如果参考资料不足以回答，只回复"知识库中暂无相关内容"，不要提供你自己的建议\n5. 回答结尾列出引用的文档标题\n6. 不要输出任何思考过程或推理标签\n\n## 参考资料\n\n' +
    contextText

  var receivedContent = false
  var cleanText = ''
  var rawText = ''

  function filterThink(chunk) {
    if (!chunk || !chunk.content) {
      onChunk(chunk)
      return
    }
    rawText += chunk.content

    var newClean = rawText.replace(/<think>[\s\S]*?<\/think>/g, '')

    var openIdx = newClean.indexOf('<think>')
    if (openIdx !== -1) {
      newClean = newClean.substring(0, openIdx)
    }

    if (newClean.length > cleanText.length) {
      var delta = newClean.substring(cleanText.length)
      cleanText = newClean
      receivedContent = true
      onChunk({ content: delta })
    }
  }

  try {
    var controller = window.ztools.ai(
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ]
      },
      filterThink
    )

    return controller.then(function () {
      if (!receivedContent) {
        throw new Error('AI 未返回任何内容。请确认 AI 模型配置正确且有可用额度。')
      }
      return { docCount: docs.length }
    })
  } catch (e) {
    throw new Error(
      'AI 调用失败: ' + (e.message || '未知错误') + '。请确认已在 ZTools 设置中配置 AI 模型。'
    )
  }
}

function getDocList() {
  try {
    var docs = readDocs()
    return docs.map(function (d) {
      return d.filename
    })
  } catch (e) {
    return []
  }
}

window.services = {
  ask: ask,
  getDocList: getDocList
}
