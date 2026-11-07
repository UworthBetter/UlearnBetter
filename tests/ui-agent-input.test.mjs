import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyAgentInput, classifyDrop } from '../concept-graph/src/assistant/ui/classify-input.ts'

test('普通文字是提问', () => {
  assert.deepEqual(classifyAgentInput('为什么先复习这一颗？'), { kind: 'ask', text: '为什么先复习这一颗？' })
  assert.deepEqual(classifyAgentInput('  看看笔记 https://example.com/a  '), { kind: 'ask', text: '看看笔记 https://example.com/a' })
})

test('想法前缀和空输入', () => {
  assert.deepEqual(classifyAgentInput('想法：纸张湿度'), { kind: 'idea', text: '纸张湿度' })
  assert.deepEqual(classifyAgentInput('想法:纸张湿度'), { kind: 'idea', text: '纸张湿度' })
  assert.deepEqual(classifyAgentInput('想法：'), { kind: 'empty' })
  assert.deepEqual(classifyAgentInput('   '), { kind: 'empty' })
})

test('整段 http(s) 才询问加入视频', () => {
  assert.deepEqual(classifyAgentInput('https://example.com/watch?v=1'), { kind: 'video-ask', url: 'https://example.com/watch?v=1' })
  assert.deepEqual(classifyAgentInput('http://example.com/a'), { kind: 'video-ask', url: 'http://example.com/a' })
})

test('拖入文件夹不解析，纯链接才当视频', () => {
  assert.equal(classifyDrop({ directory: true, url: 'https://example.com/a' }), 'folder-unsupported')
  assert.equal(classifyDrop({ directory: false, url: 'https://example.com/a' }), 'video-ask')
  assert.equal(classifyDrop({ directory: false, url: null }), 'ignore')
  assert.equal(classifyDrop({ directory: false, url: '笔记文件夹' }), 'ignore')
})
