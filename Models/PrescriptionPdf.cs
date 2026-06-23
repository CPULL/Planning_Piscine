namespace PlanningPiscine.Models;

public class PrescriptionPdf {
  public int Id { get; set; }
  public string FileName { get; set; } = string.Empty;
  public string ContentType { get; set; } = string.Empty;
  public byte[] Data { get; set; } = [];
}
