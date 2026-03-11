
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$doc = $word.Documents.Add()
$selection = $word.Selection

# Table Data (Using Unicode escape sequences to avoid encoding issues)
$data = @(
    @("STT", "NỘI DUNG (Phát sinh, giảm trừ)", "SỐ LƯỢNG", "ĐƠN GIÁ (VNĐ)", "THÀNH TIỀN (VNĐ)"),
    @("1", "Thang tải khách KPM : P(630)-CO-60-3/3 (OEM TRỌN BỘ, INOX 1,2MM)", "1", "218,400,000", "218,400,000"),
    @("2", "MT70 - Công suất : 7.5 Kw (CO, CQ công chứng) (Xuất xứ Hàn Quốc)", "1", "1,500,000", "1,500,000"),
    @("3", "MN200 - Công suất : 4.2 Kw (CO, CQ công chứng) - Pully 320 - (5 sợi cáp F8) (Xuất xứ Hàn Quốc)", "1", "3,000,000", "3,000,000"),
    @("4", "Vách sau : Kính cường lực 1 lớp dày 10mm màu trắng trong + khung inox sọc nhuyễn đồng", "1", "1,500,000", "1,500,000"),
    @("5", "Vách hông : Kính cường lực 1 lớp dày 10mm màu trắng trong + khung inox sọc nhuyễn đồng", "2", "1,500,000", "3,000,000"),
    @("6", "Vách trước : Inox sọc nhuyễn đồng. (Bao gồm ốp mặt ngoài vách trước bằng inox sọc nhuyễn đồng)", "1", "2,100,000", "2,100,000"),
    @("7", "Cửa cabin : Cửa kính cường lực 1 lớp dày 10mm màu trắng trong + khung inox sọc nhuyễn đồng", "1", "1,600,000", "1,600,000"),
    @("8", "Cửa tầng 1 : Cửa kính cường lực 1 lớp dày 10mm màu trắng trong + khung inox sọc nhuyễn đồng", "1", "1,600,000", "1,600,000"),
    @("9", "Khung bao tầng 1 : Khung bản hẹp mở rộng không quá 150mm trán không cao quá 200mm, Inox sọc nhuyễn đồng. Không hiển thị ngang có hiển thị dọc", "1", "1,500,000", "1,500,000"),
    @("10", "Cửa tầng khác : Cửa kính cường lực 1 lớp dày 10mm màu trắng trong + khung inox sọc nhuyễn đồng", "2", "1,600,000", "3,200,000"),
    @("11", "Khung bao tầng khác : Khung bản hẹp mở rộng không quá 150mm trán không cao quá 200mm, Inox sọc nhuyễn đồng. Không hiển thị ngang có hiển thị dọc", "2", "1,500,000", "3,000,000"),
    @("12", "Bao gồm bao che 2 mặt KĐT bằng sơn tôn tĩnh điện", "1", "1,300,000", "1,300,000")
)
$totalRow = @("", "Tổng cộng", "", "", "241,700,000")

$rowCount = $data.Length + 1
$colCount = $data[0].Length

$table = $doc.Tables.Add($selection.Range, $rowCount, $colCount)
$table.Borders.Enable = $true

# Populating Data
for ($r = 0; $r -lt $data.Length; $r++) {
    for ($c = 0; $c -lt $data[$r].Length; $c++) {
        $table.Cell($r + 1, $c + 1).Range.Text = $data[$r][$c]
        if ($r -eq 0) {
            $table.Cell($r + 1, $c + 1).Range.Font.Bold = $true
            $table.Cell($r + 1, $c + 1).Shading.BackgroundPatternColor = 12632256 # Light Gray
        }
    }
}

# Add Total Row
for ($c = 0; $c -lt $totalRow.Length; $c++) {
    $cell = $table.Cell($rowCount, $c + 1)
    $cell.Range.Text = $totalRow[$c]
    $cell.Range.Font.Bold = $true
    if ($c -eq 1) {
        $cell.Range.ParagraphFormat.Alignment = 1 # Center
    }
    if ($c -eq 4) {
        $cell.Shading.BackgroundPatternColor = 13434828 # Light Green (approx)
    }
}

# Adjust table
$table.Columns.Item(1).Width = 30
$table.Columns.Item(2).Width = 250

$filePath = "C:\Users\Dell OPT 3020\.gemini\antigravity\scratch\Bao_Gia_Thang_May.docx"
$doc.SaveAs($filePath)
$doc.Close()
$word.Quit()
Write-Output "File saved successfully."
