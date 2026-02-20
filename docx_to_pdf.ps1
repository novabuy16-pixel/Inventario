param(
    [Parameter(Mandatory = $true)][string]$DocPath,
    [Parameter(Mandatory = $true)][string]$PdfPath
)

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0

try {
    $doc = $word.Documents.Open($DocPath)
    $doc.SaveAs([ref] $PdfPath, [ref] 17) # 17 is wdFormatPDF
    $doc.Close([ref] 0)
}
finally {
    $word.Quit()
}
