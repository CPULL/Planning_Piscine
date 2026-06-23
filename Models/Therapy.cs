namespace PlanningPiscine.Models;

public enum TherapyType {
  Legge11,
  HktIndividual,
  HktGroup
}

public enum TherapyStatus {
  ToBeStarted,
  InProgress,
  Completed,
  Refused
}

public class Therapy {
  public int Id { get; set; }
  public int PatientId { get; set; }
  public TherapyType Type { get; set; }
  public int PaymentTypeId { get; set; }
  public int Duration { get; set; }
  public bool APacchetto { get; set; } = false;
  public TherapyStatus Status { get; set; } = TherapyStatus.ToBeStarted;
  public int? PrescriptionPdfId { get; set; }
  public string? Notes { get; set; }
  public DateTime CreatedAt { get; set; } = DateTime.Now;

  public Patient? Patient { get; set; }
  public PaymentType? PaymentType { get; set; }
  public PrescriptionPdf? PrescriptionPdf { get; set; }
}
