import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { TDocumentDefinitions, Content, Style } from 'pdfmake/interfaces';
import { TableCell } from 'pdfmake/interfaces';
import { format } from 'date-fns';
import type { ReportOptions } from '../types/reports';
import { logger } from '../utils/logger';

// Initialize pdfMake with fonts
pdfMake.vfs = pdfFonts.pdfMake.vfs;

/**
 * Service for generating PDF reports using pdfmake.
 * Provides flexible PDF generation with tables, charts, and custom styling.
 */
export class PDFExportService {
  private defaultStyles: Record<string, Style> = {
    header: {
      fontSize: 18,
      bold: true,
      margin: [0, 0, 0, 10] as [number, number, number, number],
    },
    subheader: {
      fontSize: 14,
      bold: true,
      margin: [0, 10, 0, 5] as [number, number, number, number],
    },
    tableHeader: {
      bold: true,
      fontSize: 11,
      color: 'white',
      fillColor: '#2c3e50',
    },
    tableCell: {
      fontSize: 10,
      margin: [0, 2, 0, 2] as [number, number, number, number],
    },
    footer: {
      fontSize: 9,
      color: '#666666',
    },
  };

  /**
   * Generate PDF for Overview Dashboard
   */
  async generateOverviewDashboardPDF(data: any, options?: ReportOptions): Promise<Buffer> {
    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      content: [
        this.createHeader('Overview Dashboard Report', options),
        this.createMetadataSection(data.metadata),
        { text: 'Summary Cards', style: 'subheader' },
        this.createSummaryCardsTable(data.data.summaryCards),
        { text: 'Activity Metrics', style: 'subheader', pageBreak: 'before' },
        this.createActivityMetricsTable(data.data.activityMetrics),
        { text: 'Recent Activity', style: 'subheader' },
        this.createRecentActivityTable(data.data.recentActivity),
        { text: 'Quick Actions', style: 'subheader' },
        this.createQuickActionsSection(data.data.quickActions),
      ],
      styles: this.defaultStyles,
      footer: this.createFooter,
    };

    return this.generatePDF(docDefinition);
  }

  /**
   * Generate PDF for Asset Dashboard
   */
  async generateAssetDashboardPDF(data: any, options?: ReportOptions): Promise<Buffer> {
    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      content: [
        this.createHeader('Asset Dashboard Report', options),
        this.createMetadataSection(data.metadata),
        { text: 'Asset Statistics', style: 'subheader' },
        this.createAssetStatisticsSection(data.data.assetStatistics),
        { text: 'Warranty Analysis', style: 'subheader', pageBreak: 'before' },
        this.createWarrantyAnalysisSection(data.data.warrantyAnalysis),
        { text: 'Maintenance History', style: 'subheader' },
        this.createMaintenanceHistorySection(data.data.maintenanceHistory),
        { text: 'Asset Value Analysis', style: 'subheader', pageBreak: 'before' },
        this.createAssetValueSection(data.data.assetValue),
      ],
      styles: this.defaultStyles,
      footer: this.createFooter,
    };

    return this.generatePDF(docDefinition);
  }

  /**
   * Generate PDF for Task Dashboard
   */
  async generateTaskDashboardPDF(data: any, options?: ReportOptions): Promise<Buffer> {
    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      content: [
        this.createHeader('Task Dashboard Report', options),
        this.createMetadataSection(data.metadata),
        { text: 'Task Metrics', style: 'subheader' },
        this.createTaskMetricsSection(data.data.taskMetrics),
        { text: 'Performance Analysis', style: 'subheader', pageBreak: 'before' },
        this.createPerformanceAnalysisSection(data.data.performanceAnalysis),
        { text: 'Cost Analysis', style: 'subheader' },
        this.createCostAnalysisSection(data.data.costAnalysis),
        { text: 'User Performance', style: 'subheader', pageBreak: 'before' },
        this.createUserPerformanceTable(data.data.userPerformance),
        { text: 'Task Backlog', style: 'subheader' },
        this.createTaskBacklogSection(data.data.taskBacklog),
      ],
      styles: this.defaultStyles,
      footer: this.createFooter,
    };

    return this.generatePDF(docDefinition);
  }

  /**
   * Generate PDF for generic report data
   */
  async generateReportPDF(
    reportData: any,
    reportName: string,
    options?: ReportOptions,
  ): Promise<Buffer> {
    const content: Content[] = [
      this.createHeader(reportName, options),
      { text: `Generated on: ${format(new Date(), 'PPP')}`, fontSize: 10, margin: [0, 0, 0, 20] },
    ];

    // Handle different report structures
    if (reportData.summary) {
      content.push({ text: 'Summary', style: 'subheader' });
      content.push(this.createSummaryTable(reportData.summary));
    }

    if (Array.isArray(reportData)) {
      content.push({ text: 'Report Data', style: 'subheader' });
      content.push(this.createDataTable(reportData));
    } else if (reportData.data && Array.isArray(reportData.data)) {
      content.push({ text: 'Report Data', style: 'subheader' });
      content.push(this.createDataTable(reportData.data));
    }

    // Add any additional sections
    Object.keys(reportData).forEach((key) => {
      if (key !== 'summary' && key !== 'data' && key !== 'metadata') {
        const section = reportData[key];
        if (Array.isArray(section) && section.length > 0) {
          content.push({
            text: this.formatSectionTitle(key),
            style: 'subheader',
            pageBreak: 'before',
          });
          content.push(this.createDataTable(section));
        }
      }
    });

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageOrientation: this.determineOrientation(reportData),
      content,
      styles: this.defaultStyles,
      footer: this.createFooter,
    };

    return this.generatePDF(docDefinition);
  }

  /**
   * Create header section
   */
  private createHeader(title: string, options?: ReportOptions): Content[] {
    const header: Content[] = [];

    if (options?.customBranding?.logo) {
      header.push({
        image: options.customBranding.logo,
        width: 100,
        alignment: 'right',
        margin: [0, 0, 0, 10] as [number, number, number, number],
      });
    }

    header.push({
      text: options?.customBranding?.companyName || 'Asset Management System',
      fontSize: 12,
      color: options?.customBranding?.primaryColor || '#2c3e50',
      margin: [0, 0, 0, 5] as [number, number, number, number],
    });

    header.push({
      text: title,
      style: 'header',
    });

    return header;
  }

  /**
   * Create metadata section
   */
  private createMetadataSection(metadata: any): Content {
    const rows: any[][] = [
      ['Generated At:', format(metadata.generatedAt, 'PPP HH:mm:ss')],
      ['Time Range:', metadata.timeRange],
      ['Period:', `${format(metadata.startDate, 'PP')} - ${format(metadata.endDate, 'PP')}`],
    ];

    if (metadata.filters.locationId) {
      rows.push(['Location Filter:', metadata.filters.locationId]);
    }
    if (metadata.filters.userId) {
      rows.push(['User Filter:', metadata.filters.userId]);
    }

    return {
      table: {
        widths: [100, '*'],
        body: rows,
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 20] as [number, number, number, number],
    };
  }

  /**
   * Create summary cards table
   */
  private createSummaryCardsTable(summaryCards: any): Content {
    return {
      table: {
        widths: ['*', '*', '*', '*'],
        body: [
          [
            { text: 'Total Assets', style: 'tableHeader' },
            { text: 'Active Assets', style: 'tableHeader' },
            { text: 'Total Tasks', style: 'tableHeader' },
            { text: 'Open Tasks', style: 'tableHeader' },
          ],
          [
            { text: summaryCards.totalAssets.toString(), style: 'tableCell' },
            { text: summaryCards.activeAssets.toString(), style: 'tableCell' },
            { text: summaryCards.totalTasks.toString(), style: 'tableCell' },
            { text: summaryCards.openTasks.toString(), style: 'tableCell' },
          ],
          [
            { text: 'Overdue Tasks', style: 'tableHeader' },
            { text: 'Total Users', style: 'tableHeader' },
            { text: 'Active Users', style: 'tableHeader' },
            { text: 'Total Value', style: 'tableHeader' },
          ],
          [
            { text: summaryCards.overdueTasks.toString(), style: 'tableCell' },
            { text: summaryCards.totalUsers.toString(), style: 'tableCell' },
            { text: summaryCards.activeUsers.toString(), style: 'tableCell' },
            { text: `$${summaryCards.totalValue.toLocaleString()}`, style: 'tableCell' },
          ],
        ],
      },
      margin: [0, 0, 0, 20] as [number, number, number, number],
    };
  }

  /**
   * Create activity metrics table
   */
  private createActivityMetricsTable(metrics: any): Content {
    return {
      table: {
        widths: ['*', 'auto'],
        body: [
          ['Metric', 'Value'],
          ['Tasks Created', metrics.tasksCreatedCount.toString()],
          ['Tasks Completed', metrics.tasksCompletedCount.toString()],
          ['Assets Added', metrics.assetsAddedCount.toString()],
          ['Assets Updated', metrics.assetsUpdatedCount.toString()],
          ['Avg Task Completion Time', `${metrics.avgTaskCompletionTime} hours`],
          ['Task Completion Rate', `${metrics.taskCompletionRate}%`],
        ].map((row, index) =>
          index === 0
            ? row.map((cell) => ({ text: cell, style: 'tableHeader' }))
            : row.map((cell) => ({ text: cell, style: 'tableCell' })),
        ),
      },
    };
  }

  /**
   * Create recent activity table
   */
  private createRecentActivityTable(activities: any[]): Content {
    if (activities.length === 0) {
      return { text: 'No recent activity', italics: true, color: '#666666' };
    }

    const headers = ['Type', 'Title', 'User', 'Time'];
    const rows = activities.map((activity) => [
      this.formatActivityType(activity.type),
      activity.title,
      activity.userName,
      format(new Date(activity.timestamp), 'PP HH:mm'),
    ]);

    return this.createTable(headers, rows);
  }

  /**
   * Create quick actions section
   */
  private createQuickActionsSection(quickActions: any): Content[] {
    const content: Content[] = [];

    if (quickActions.urgentTasks.length > 0) {
      content.push({
        text: 'Urgent Tasks',
        fontSize: 12,
        bold: true,
        margin: [0, 10, 0, 5] as [number, number, number, number],
      });
      content.push(
        this.createTable(
          ['Title', 'Due Date', 'Priority', 'Asset'],
          quickActions.urgentTasks.map((task: any) => [
            task.title,
            format(new Date(task.dueDate), 'PP'),
            task.priority,
            task.assetName || '-',
          ]),
        ),
      );
    }

    if (quickActions.warrantyAlerts.length > 0) {
      content.push({
        text: 'Warranty Alerts',
        fontSize: 12,
        bold: true,
        margin: [0, 10, 0, 5] as [number, number, number, number],
      });
      content.push(
        this.createTable(
          ['Asset', 'Expiry Date', 'Days Until Expiry'],
          quickActions.warrantyAlerts.map((alert: any) => [
            alert.assetName,
            format(new Date(alert.warrantyExpiry), 'PP'),
            alert.daysUntilExpiry.toString(),
          ]),
        ),
      );
    }

    return content;
  }

  /**
   * Create asset statistics section
   */
  private createAssetStatisticsSection(stats: any): Content[] {
    const content: Content[] = [];

    // By Category
    content.push({ text: 'By Category', fontSize: 12, bold: true });
    content.push(
      this.createTable(
        ['Category', 'Count'],
        Object.entries(stats.byCategory).map(([cat, count]) => [cat, count!.toString()]),
      ),
    );

    // By Status
    content.push({
      text: 'By Status',
      fontSize: 12,
      bold: true,
      margin: [0, 10, 0, 5] as [number, number, number, number],
    });
    content.push(
      this.createTable(
        ['Status', 'Count'],
        Object.entries(stats.byStatus).map(([status, count]) => [status, count!.toString()]),
      ),
    );

    // By Age
    content.push({
      text: 'By Age',
      fontSize: 12,
      bold: true,
      margin: [0, 10, 0, 5] as [number, number, number, number],
    });
    content.push(
      this.createTable(
        ['Age Range', 'Count'],
        [
          ['Less than 1 year', stats.byAge.lessThan1Year.toString()],
          ['1-3 years', stats.byAge.oneToThreeYears.toString()],
          ['3-5 years', stats.byAge.threeToFiveYears.toString()],
          ['More than 5 years', stats.byAge.moreThanFiveYears.toString()],
          ['Unknown', stats.byAge.unknown.toString()],
        ],
      ),
    );

    return content;
  }

  /**
   * Create warranty analysis section
   */
  private createWarrantyAnalysisSection(warranty: any): Content[] {
    const content: Content[] = [];

    // Summary
    content.push({
      table: {
        widths: ['*', 'auto'],
        body: [
          ['Active Warranties', warranty.activeWarranties.toString()],
          ['Lifetime Warranties', warranty.lifetimeWarranties.toString()],
          ['Expired Warranties', warranty.expiredWarranties.toString()],
        ],
      },
      layout: 'lightHorizontalLines',
    });

    // Expiring warranties
    if (warranty.expiringWarranties.length > 0) {
      content.push({
        text: 'Expiring Soon',
        fontSize: 12,
        bold: true,
        margin: [0, 10, 0, 5] as [number, number, number, number],
      });
      content.push(
        this.createTable(
          ['Asset', 'Category', 'Location', 'Expiry', 'Days Left'],
          warranty.expiringWarranties
            .slice(0, 10)
            .map((w: any) => [
              w.assetName,
              w.category,
              w.location,
              format(new Date(w.expiryDate), 'PP'),
              w.daysUntilExpiry.toString(),
            ]),
        ),
      );
    }

    return content;
  }

  /**
   * Create maintenance history section
   */
  private createMaintenanceHistorySection(maintenance: any): Content[] {
    const content: Content[] = [];

    // Summary
    content.push({
      columns: [
        { text: `Scheduled: ${maintenance.scheduledMaintenance}`, width: '*' },
        { text: `Completed: ${maintenance.completedMaintenance}`, width: '*' },
        { text: `Overdue: ${maintenance.overdueMaintenance}`, width: '*' },
      ],
      margin: [0, 0, 0, 10] as [number, number, number, number],
    });

    // Costs
    content.push({ text: 'Maintenance Costs', fontSize: 12, bold: true });
    content.push({
      table: {
        widths: ['*', 'auto'],
        body: [
          ['Total Tasks', maintenance.maintenanceCosts.period.toString()],
          ['Actual Cost', `$${maintenance.maintenanceCosts.actual.toLocaleString()}`],
          ['Estimated Cost', `$${maintenance.maintenanceCosts.estimated.toLocaleString()}`],
        ],
      },
      layout: 'lightHorizontalLines',
    });

    // Upcoming maintenance
    if (maintenance.upcomingMaintenance.length > 0) {
      content.push({
        text: 'Upcoming Maintenance',
        fontSize: 12,
        bold: true,
        margin: [0, 10, 0, 5] as [number, number, number, number],
      });
      content.push(
        this.createTable(
          ['Asset', 'Task', 'Due Date', 'Est. Cost'],
          maintenance.upcomingMaintenance.map((m: any) => [
            m.assetName,
            m.taskTitle,
            format(new Date(m.dueDate), 'PP'),
            `$${m.estimatedCost.toLocaleString()}`,
          ]),
        ),
      );
    }

    return content;
  }

  /**
   * Create asset value section
   */
  private createAssetValueSection(value: any): Content[] {
    const content: Content[] = [];

    // Summary
    content.push({
      table: {
        widths: ['*', 'auto'],
        body: [
          ['Total Purchase Value', `$${value.totalPurchaseValue.toLocaleString()}`],
          ['Current Value (Depreciated)', `$${value.depreciatedValue.toLocaleString()}`],
          [
            'Total Depreciation',
            `$${(value.totalPurchaseValue - value.depreciatedValue).toLocaleString()}`,
          ],
        ],
      },
      layout: 'lightHorizontalLines',
    });

    // Top value assets
    if (value.topValueAssets.length > 0) {
      content.push({
        text: 'Top Value Assets',
        fontSize: 12,
        bold: true,
        margin: [0, 10, 0, 5] as [number, number, number, number],
      });
      content.push(
        this.createTable(
          ['Asset', 'Category', 'Purchase Price', 'Purchase Date'],
          value.topValueAssets.map((asset: any) => [
            asset.name,
            asset.category,
            `$${asset.purchasePrice.toLocaleString()}`,
            asset.purchaseDate ? format(new Date(asset.purchaseDate), 'PP') : '-',
          ]),
        ),
      );
    }

    return content;
  }

  /**
   * Create task metrics section
   */
  private createTaskMetricsSection(metrics: any): Content[] {
    const content: Content[] = [];

    // By Status
    content.push({ text: 'By Status', fontSize: 12, bold: true });
    content.push(
      this.createTable(
        ['Status', 'Count'],
        Object.entries(metrics.byStatus).map(([status, count]) => [status, count!.toString()]),
      ),
    );

    // By Priority
    content.push({
      text: 'By Priority',
      fontSize: 12,
      bold: true,
      margin: [0, 10, 0, 5] as [number, number, number, number],
    });
    content.push(
      this.createTable(
        ['Priority', 'Count'],
        Object.entries(metrics.byPriority).map(([priority, count]) => [
          priority,
          count!.toString(),
        ]),
      ),
    );

    // Completion rates
    content.push({
      text: 'Completion Rates',
      fontSize: 12,
      bold: true,
      margin: [0, 10, 0, 5] as [number, number, number, number],
    });
    content.push({
      table: {
        widths: ['*', 'auto'],
        body: [
          ['Overall Completion Rate', `${metrics.completionRate.overall}%`],
          ['On-Time Completion Rate', `${metrics.completionRate.onTime}%`],
          ['Late Completion Rate', `${metrics.completionRate.late}%`],
        ],
      },
      layout: 'lightHorizontalLines',
    });

    return content;
  }

  /**
   * Create performance analysis section
   */
  private createPerformanceAnalysisSection(performance: any): Content[] {
    const content: Content[] = [];

    content.push({
      columns: [
        { text: `Created: ${performance.tasksCreated}`, width: '*' },
        { text: `Completed: ${performance.tasksCompleted}`, width: '*' },
        { text: `Overdue: ${performance.tasksOverdue}`, width: '*' },
        { text: `Cancelled: ${performance.tasksCancelled}`, width: '*' },
      ],
      margin: [0, 0, 0, 10] as [number, number, number, number],
    });

    // Trend chart would go here if we had chart support

    return content;
  }

  /**
   * Create cost analysis section
   */
  private createCostAnalysisSection(cost: any): Content[] {
    const content: Content[] = [];

    // Summary
    content.push({
      table: {
        widths: ['*', 'auto'],
        body: [
          ['Total Estimated Cost', `$${cost.totalEstimatedCost.toLocaleString()}`],
          ['Total Actual Cost', `$${cost.totalActualCost.toLocaleString()}`],
          [
            'Variance',
            `$${cost.variance.toLocaleString()} (${cost.variance >= 0 ? '+' : ''}${((cost.variance / cost.totalEstimatedCost) * 100).toFixed(1)}%)`,
          ],
        ],
      },
      layout: 'lightHorizontalLines',
    });

    // Over-budget tasks
    if (cost.overBudgetTasks.length > 0) {
      content.push({
        text: 'Over-Budget Tasks',
        fontSize: 12,
        bold: true,
        margin: [0, 10, 0, 5] as [number, number, number, number],
      });
      content.push(
        this.createTable(
          ['Task', 'Estimated', 'Actual', 'Over %'],
          cost.overBudgetTasks
            .slice(0, 10)
            .map((task: any) => [
              task.title.substring(0, 40) + (task.title.length > 40 ? '...' : ''),
              `$${task.estimatedCost.toLocaleString()}`,
              `$${task.actualCost.toLocaleString()}`,
              `${task.percentOver}%`,
            ]),
        ),
      );
    }

    return content;
  }

  /**
   * Create user performance table
   */
  private createUserPerformanceTable(users: any[]): Content {
    if (users.length === 0) {
      return { text: 'No user performance data available', italics: true, color: '#666666' };
    }

    return this.createTable(
      ['User', 'Assigned', 'Completed', 'Completion %', 'On-Time %'],
      users
        .slice(0, 10)
        .map((user) => [
          user.userName,
          user.tasksAssigned.toString(),
          user.tasksCompleted.toString(),
          `${user.completionRate}%`,
          `${user.onTimeRate}%`,
        ]),
    );
  }

  /**
   * Create task backlog section
   */
  private createTaskBacklogSection(backlog: any): Content[] {
    const content: Content[] = [];

    content.push({
      table: {
        widths: ['*', 'auto'],
        body: [
          ['Total Backlog', backlog.total.toString()],
          ['Average Age', `${backlog.avgAge} days`],
        ],
      },
      layout: 'lightHorizontalLines',
    });

    if (backlog.oldestTask) {
      content.push({
        text: 'Oldest Task',
        fontSize: 12,
        bold: true,
        margin: [0, 10, 0, 5] as [number, number, number, number],
      });
      content.push({
        text: `${backlog.oldestTask.title} (${backlog.oldestTask.daysOld} days old)`,
        fontSize: 10,
        color: '#666666',
      });
    }

    return content;
  }

  /**
   * Create generic data table
   */
  private createDataTable(data: any[]): Content {
    if (!data || data.length === 0) {
      return { text: 'No data available', italics: true, color: '#666666' };
    }

    const headers = Object.keys(data[0]);
    const rows = data.map((row) =>
      headers.map((header) => {
        const value = row[header];
        if (value === null || value === undefined) return '-';
        if (value instanceof Date) return format(value, 'PP');
        if (typeof value === 'object') return JSON.stringify(value);
        return value.toString();
      }),
    );

    return this.createTable(headers, rows);
  }

  /**
   * Create summary table
   */
  private createSummaryTable(summary: any): Content {
    const rows = Object.entries(summary).map(([key, value]) => [
      this.formatHeaderName(key),
      this.formatValue(value),
    ]);

    return {
      table: {
        widths: ['*', 'auto'],
        body: rows.map((row, index) =>
          row.map((cell) => ({ text: cell, style: index === 0 ? 'tableHeader' : 'tableCell' })),
        ),
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 20] as [number, number, number, number],
    };
  }

  /**
   * Create table helper
   */
  private createTable(headers: string[], rows: string[][]): Content {
    return {
      table: {
        headerRows: 1,
        widths: headers.map(() => '*'),
        body: [
          headers.map((h) => ({ text: h, style: 'tableHeader' })),
          ...rows.map((row) => row.map((cell) => ({ text: cell, style: 'tableCell' }))),
        ],
      },
      layout: {
        fillColor: (rowIndex: number) => {
          if (rowIndex === 0) return '#2c3e50';
          return rowIndex % 2 === 0 ? '#f8f9fa' : null;
        },
      },
    };
  }

  /**
   * Create footer
   */
  private createFooter(currentPage: number, pageCount: number): Content {
    return {
      columns: [
        { text: `Generated by Asset Management System`, style: 'footer' },
        { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', style: 'footer' },
      ],
      margin: [40, 0] as [number, number],
    };
  }

  /**
   * Generate PDF from document definition
   */
  private async generatePDF(docDefinition: TDocumentDefinitions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const pdfDoc = pdfMake.createPdf(docDefinition);
        pdfDoc.getBuffer((buffer: Buffer) => {
          resolve(buffer);
        });
      } catch (error) {
        logger.error('PDF generation failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Determine page orientation based on data
   */
  private determineOrientation(data: any): 'portrait' | 'landscape' {
    // If we have many columns, use landscape
    if (Array.isArray(data) && data.length > 0) {
      const columns = Object.keys(data[0]).length;
      return columns > 6 ? 'landscape' : 'portrait';
    }
    return 'portrait';
  }

  /**
   * Format activity type for display
   */
  private formatActivityType(type: string): string {
    const typeMap: Record<string, string> = {
      task_created: 'Task Created',
      task_completed: 'Task Completed',
      asset_added: 'Asset Added',
      asset_updated: 'Asset Updated',
    };
    return typeMap[type] || type;
  }

  /**
   * Format section title
   */
  private formatSectionTitle(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Format header name
   */
  private formatHeaderName(name: string): string {
    return name
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Format value for display
   */
  private formatValue(value: any): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') {
      if (value >= 1000) return value.toLocaleString();
      if (value % 1 !== 0) return value.toFixed(2);
      return value.toString();
    }
    if (value instanceof Date) return format(value, 'PP');
    if (typeof value === 'object') return JSON.stringify(value);
    return value.toString();
  }
}
