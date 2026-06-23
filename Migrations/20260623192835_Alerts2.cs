using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PlanningPiscine.Migrations
{
    /// <inheritdoc />
    public partial class Alerts2 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Alerts_Patients_PatientId",
                table: "Alerts");

            migrationBuilder.DropForeignKey(
                name: "FK_Alerts_Therapies_TherapyId",
                table: "Alerts");

            migrationBuilder.AlterColumn<int>(
                name: "TherapyId",
                table: "Alerts",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AlterColumn<int>(
                name: "PatientId",
                table: "Alerts",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AddColumn<DateTime>(
                name: "LastSlot",
                table: "Alerts",
                type: "datetime(6)",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<int>(
                name: "UserId",
                table: "Alerts",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Alerts_UserId",
                table: "Alerts",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Alerts_Patients_PatientId",
                table: "Alerts",
                column: "PatientId",
                principalTable: "Patients",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Alerts_Therapies_TherapyId",
                table: "Alerts",
                column: "TherapyId",
                principalTable: "Therapies",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Alerts_Users_UserId",
                table: "Alerts",
                column: "UserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Alerts_Patients_PatientId",
                table: "Alerts");

            migrationBuilder.DropForeignKey(
                name: "FK_Alerts_Therapies_TherapyId",
                table: "Alerts");

            migrationBuilder.DropForeignKey(
                name: "FK_Alerts_Users_UserId",
                table: "Alerts");

            migrationBuilder.DropIndex(
                name: "IX_Alerts_UserId",
                table: "Alerts");

            migrationBuilder.DropColumn(
                name: "LastSlot",
                table: "Alerts");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Alerts");

            migrationBuilder.AlterColumn<int>(
                name: "TherapyId",
                table: "Alerts",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "PatientId",
                table: "Alerts",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Alerts_Patients_PatientId",
                table: "Alerts",
                column: "PatientId",
                principalTable: "Patients",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Alerts_Therapies_TherapyId",
                table: "Alerts",
                column: "TherapyId",
                principalTable: "Therapies",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
