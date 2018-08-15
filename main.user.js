// ==UserScript==
// @name         cf-append-form
// @name:ja      cf-append-form
// @namespace    https://twitter.com/lumc_
// @version      1.1
// @description  append the form to submit to codeforces contest problem page.
// @description:ja codeforcesのコンテストの問題ページに提出フォームを置くツール.
// @author       Luma
// @match        http*://codeforces.com/contest/*/problem/*
// @grant        none
// ==/UserScript==

/* global $ ace alwaysDisable */

;(function () {
  'use strict'
  const origin = location.origin
  const pathname = location.pathname
  const modelist = ace.require('ace/ext/modelist')
  let $form
  let $programType
  let $toggleEditor
  let $tabSize
  let $selectProblem

  let editor
  // got from submit page
  /* eslint-next-line object-property-newline : 0 */
  const extensionMap = {
    1: 'program.cpp',
    2: 'program.cpp',
    3: 'program.dpr',
    4: 'program.pas',
    6: 'program.php',
    7: 'program.py',
    8: 'program.rb',
    9: 'program.cs',
    10: 'program.c',
    12: 'program.hs',
    13: 'program.pl',
    19: 'program.ml',
    20: '[^{}]*objects+(w+).*|$1.scala',
    28: 'program.d',
    31: 'a.py',
    32: 'program.go',
    34: 'program.js',
    36: '[^{}]*publics+(final)?s*classs+(w+).*|$2.java',
    40: 'a.py',
    41: 'a.py',
    42: 'program.cpp',
    43: 'program.c',
    48: 'program.kt',
    49: 'program.rs',
    50: 'program.cpp',
    51: 'program.pas',
    52: 'program.cpp',
    53: 'program.cpp',
    54: 'program.cpp',
    55: 'program.js'
  }

  initAppendForm()

  async function initAppendForm () {
    // only problem page
    const pattern = /(.*)\/problem\/([^/])*\/?$/
    if (!pattern.test(pathname)) return

    const submitURL = origin + pathname.match(pattern)[1] + '/submit'
    const probremID = pathname.match(pattern)[2]
    const raw = await $.get(submitURL)
    $form = $(raw).find('form.submit-form')
    $('.problem-statement').append($form)
    editor = ace.edit('editor')

    $form.attr('action', submitURL + $form.attr('action'))

    $programType = $form.find('select[name=programTypeId]')
    $toggleEditor = $form.find('#toggleEditorCheckbox')
    $tabSize = $form.find('#tabSizeInput')
    $selectProblem = $form.find('[name=submittedProblemIndex]')

    // codeforces default settings
    editor.setTheme('ace/theme/chrome')
    editor.setShowPrintMargin(false)
    editor.setOptions({
      enableBasicAutocompletion: true
    })

    $selectProblem.val(probremID)

    // そのままdisabledにするとformに含まれなくなるので
    const $cloneSelectProblem = $($selectProblem.prop('outerHTML'))
    $cloneSelectProblem.prop('disabled', true)
    $cloneSelectProblem.removeAttr('name')
    $cloneSelectProblem.attr('id', 'submitted_problem_index_fake_display')
    $selectProblem.after($cloneSelectProblem)

    $selectProblem.prop('hidden', true)

    const update =
      getFuctionDef(raw, 'updateSubmitButtonState') ||
      getFuctionDef(raw, 'updateProblemLockInfo')
    if (update) {
      try {
        // run as object
        /* eslint-disable-next-line no-eval */
        eval(`;(${update})();`)
      } catch (e) {}
    }

    applyEditorVisibility()
    setAceMode()
    updateFilesAndLimits()

    $toggleEditor.on('change', () => {
      applyEditorVisibility()

      const editorEnabled = !$toggleEditor.is(':checked')
      $.post(
        '/data/customtest',
        {
          communityCode: '',
          action: 'setEditorEnabled',
          editorEnabled: editorEnabled
        },
        function (response) {}
      )
      return false
    })

    $tabSize.on('change', () => {
      const tabSize = $tabSize.val()
      editor.setOptions({ tabSize })
      $.post(
        '/data/customtest',
        { communityCode: '', action: 'setTabSize', tabSize: tabSize },
        function (response) {}
      )
    })

    $programType.on('change', () => {
      setAceMode()
    })

    editor.getSession().on('change', function () {
      $('#sourceCodeTextarea').val(editor.getValue())
    })

    $('#sourceCodeTextarea').on('change', function () {
      editor.setValue($(this).val(), 1)
    })

    $form.on('submit', preSubmit)
  }
  function setAceMode () {
    var filePath = extensionMap[$programType.val()]
    const mode = modelist.getModeForPath(filePath).mode
    if (editor) editor.session.setMode(mode)
  }
  function applyEditorVisibility () {
    if ($('#toggleEditorCheckbox').is(':checked')) {
      $('#editor').hide()
      $('#sourceCodeTextarea').show()
      $('.tabSizeDiv').hide()
    } else {
      $('#editor').show()
      editor.setValue(editor.getValue())
      $('#sourceCodeTextarea').hide()
      $('.tabSizeDiv').show()
    }
  }

  function updateFilesAndLimits () {
    var problemFiles = $('#submittedProblemFiles')
    var problemLimits = $('#submittedProblemLimits')

    var problemIndex = $('select[name=submittedProblemIndex]').val()
    var option = $('select[name=submittedProblemIndex] option:selected')

    var timeLimit = option.attr('data-time-limit')
    var memoryLimit = option.attr('data-memory-limit')
    var inputFile = option.attr('data-input-file')
    var outputFile = option.attr('data-output-file')

    if (problemIndex === '') {
      problemFiles.text('')
      problemLimits.text('')
    } else {
      var filesStyle = 'float: left; font-weight: bold'
      if (inputFile === '') {
        if (outputFile === '') {
          filesStyle = 'float: left;'
          problemFiles.text('standard input/output')
        } else {
          problemFiles.text('standard input / ' + outputFile)
        }
      } else {
        if (outputFile === '') {
          problemFiles.text(inputFile + ' / standard output')
        } else {
          problemFiles.text(inputFile + ' / ' + outputFile)
        }
      }

      problemFiles.attr('style', filesStyle)
      problemLimits.text(timeLimit + ' s, ' + memoryLimit + ' MB')
    }
  }

  function preSubmit () {
    const button = $form.find('input.submit')
    const img = $form.find('img.ajax-loading-gif')
    if ($(this).hasAttr('data-submitting')) {
      return true
    }
    if (button.prop('disabled')) {
      return false
    }
    var result = callback.call(this)
    if (result || alwaysDisable) {
      img.show()
      button.prop('disabled', true)
      setTimeout(function () {
        img.hide()
        button.prop('disabled', false)
      }, alwaysDisable ? 1000 : 10000)
    }
    return result
  }

  function callback () {
    var form = $(this)
    var $ftaa = form.find("input[name='ftaa']")
    var $bfaa = form.find("input[name='bfaa']")

    if (window._ftaa && window._bfaa) {
      $ftaa.val(window._ftaa)
      $bfaa.val(window._bfaa)
    }

    if (form.attr('enctype') === 'multipart/form-data') {
      var sourceFiles = form.find('.table-form input[name=sourceFile]')

      if (
        sourceFiles.length === 1 &&
        sourceFiles[0].files &&
        sourceFiles[0].files.length === 0
      ) {
        form.removeAttr('enctype')
      }
    }

    return true
  }

  // not so good method
  function getFuctionDef (script, fname) {
    const res = script.match(
      new RegExp(`(?:^|\\n)(.*)function\\s+${fname}[\\s\\S]+\\n\\1}`)
    )
    return res && res[0]
  }
})()
