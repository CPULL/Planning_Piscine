namespace PlanningPiscine.Models;

public class PaymentType {
  public int Id { get; set; }
  public string Name { get; set; } = string.Empty;
  public int Type { get; set; } = 1; // 0=System, 1=Active, 2=Disabled
}
