$word = New-Object -ComObject Word.Application
if ($word) {
    Write-Output "WORD_OK"
    $word.Quit()
} else {
    Write-Output "NO_WORD"
}
