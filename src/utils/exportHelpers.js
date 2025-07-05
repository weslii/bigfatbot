const PDFDocument = require('pdfkit');

// Helper function to generate CSV from orders
function generateOrdersCSV(orders) {
  const headers = [
    'Order ID',
    'Business',
    'Customer Name',
    'Customer Phone',
    'Address',
    'Items',
    'Status',
    'Delivery Date',
    'Notes',
    'Created At'
  ];
  
  const csvRows = [headers.join(',')];
  
  orders.forEach(order => {
    const row = [
      `"${order.order_id || ''}"`,
      `"${order.business_name || ''}"`,
      `"${order.customer_name || ''}"`,
      `"${order.customer_phone || ''}"`,
      `"${order.address || ''}"`,
      `"${order.items || ''}"`,
      `"${order.status || ''}"`,
      `"${(order.delivery_date ? (order.delivery_date instanceof Date ? order.delivery_date.toISOString() : order.delivery_date) : '').replace(/"/g, '""')}"`,
      `"${order.notes || ''}"`,
      `"${(order.created_at ? (order.created_at instanceof Date ? order.created_at.toISOString() : order.created_at) : '').replace(/"/g, '""')}"`
    ];
    csvRows.push(row.join(','));
  });
  
  return csvRows.join('\n');
}

// Helper function to generate PDF from orders
function generateOrdersPDF(orders, res, businessName = null) {
  const doc = new PDFDocument({ 
    margin: 30, 
    size: 'A4',
    layout: 'portrait'
  });
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="orders${businessName ? '-' + businessName.replace(/\s+/g, '_') : ''}.pdf"`);
  doc.pipe(res);

  // Header with styling
  doc.rect(0, 0, doc.page.width, 80).fill('#2563eb');
  doc.fontSize(24).fillColor('white').text(businessName ? `Orders Report - ${businessName}` : 'Orders Report', 30, 25, { align: 'center' });
  doc.fontSize(12).text(`Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 30, 55, { align: 'center' });
  
  // Reset colors
  doc.fillColor('black');
  
  // Summary section
  doc.moveDown(2);
  doc.fontSize(16).font('Helvetica-Bold').text('Summary', { underline: true });
  doc.moveDown(0.5);
  
  const totalOrders = orders.length;
  const statusCounts = orders.reduce((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {});
  
  doc.fontSize(12).font('Helvetica');
  doc.text(`Total Orders: ${totalOrders}`, { continued: true });
  doc.text(`  |  `, { continued: true });
  doc.text(`Pending: ${statusCounts.pending || 0}`, { continued: true });
  doc.text(`  |  `, { continued: true });
  doc.text(`Delivered: ${statusCounts.delivered || 0}`, { continued: true });
  doc.text(`  |  `, { continued: true });
  doc.text(`Cancelled: ${statusCounts.cancelled || 0}`);
  
  // Status distribution chart (simple bar chart)
  doc.moveDown(1);
  doc.fontSize(14).font('Helvetica-Bold').text('Status Distribution', { underline: true });
  doc.moveDown(0.5);
  
  const chartWidth = 400;
  const chartHeight = 100;
  const chartX = 50;
  const chartY = doc.y;
  
  // Draw chart background
  doc.rect(chartX, chartY, chartWidth, chartHeight).stroke('#e5e7eb');
  
  // Draw bars for each status
  const statuses = Object.keys(statusCounts);
  const barWidth = chartWidth / statuses.length - 10;
  const maxCount = Math.max(...Object.values(statusCounts));
  
  statuses.forEach((status, index) => {
    const barHeight = (statusCounts[status] / maxCount) * (chartHeight - 20);
    const barX = chartX + (index * (barWidth + 10)) + 5;
    const barY = chartY + chartHeight - barHeight - 10;
    
    // Color coding for status
    let color = '#6b7280';
    if (status === 'delivered') color = '#10b981';
    else if (status === 'pending') color = '#f59e0b';
    else if (status === 'cancelled') color = '#ef4444';
    
    doc.rect(barX, barY, barWidth, barHeight).fill(color);
    doc.fontSize(10).fillColor('white').text(statusCounts[status], barX + barWidth/2 - 10, barY + barHeight/2 - 5);
    doc.fontSize(8).text(status, barX + barWidth/2 - 15, barY + barHeight + 5);
  });
  
  doc.fillColor('black');
  doc.moveDown(3);
  
  // Orders table
  doc.fontSize(16).font('Helvetica-Bold').text('Order Details', { underline: true });
  doc.moveDown(0.5);
  
  if (orders.length === 0) {
    doc.fontSize(12).font('Helvetica').text('No orders found for the selected criteria.');
    doc.end();
    return;
  }
  
  // Table styling
  const tableTop = doc.y;
  const tableLeft = 30;
  const tableWidth = doc.page.width - 60;
  const colWidths = [80, 100, 80, 80, 80, 60, 80, 80]; // Adjusted column widths
  const headers = ['Order ID', 'Customer', 'Phone', 'Business', 'Status', 'Items', 'Delivery Date', 'Created'];
  
  // Draw table header
  doc.rect(tableLeft, tableTop, tableWidth, 25).fill('#f3f4f6');
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#374151');
  
  let currentX = tableLeft + 5;
  headers.forEach((header, i) => {
    doc.text(header, currentX, tableTop + 8);
    currentX += colWidths[i];
  });
  
  // Draw table rows
  doc.fontSize(9).font('Helvetica').fillColor('black');
  let currentY = tableTop + 25;
  
  orders.forEach((order, index) => {
    // Alternate row colors
    if (index % 2 === 0) {
      doc.rect(tableLeft, currentY, tableWidth, 20).fill('#f9fafb');
    }
    
    // Status color coding
    let statusColor = '#6b7280';
    if (order.status === 'delivered') statusColor = '#10b981';
    else if (order.status === 'pending') statusColor = '#f59e0b';
    else if (order.status === 'cancelled') statusColor = '#ef4444';
    
    const rowData = [
      order.order_id || 'N/A',
      (order.customer_name || 'N/A').substring(0, 15),
      (order.customer_phone || 'N/A').substring(0, 12),
      (order.business_name || 'N/A').substring(0, 15),
      order.status || 'N/A',
      (typeof order.items === 'string' ? order.items : JSON.stringify(order.items)).substring(0, 10) + '...',
      order.delivery_date ? (order.delivery_date instanceof Date ? order.delivery_date.toLocaleDateString() : new Date(order.delivery_date).toLocaleDateString()) : 'N/A',
      order.created_at ? (order.created_at instanceof Date ? order.created_at.toLocaleDateString() : new Date(order.created_at).toLocaleDateString()) : 'N/A'
    ];
    
    currentX = tableLeft + 5;
    rowData.forEach((cell, i) => {
      if (i === 4) { // Status column
        doc.fillColor(statusColor);
      } else {
        doc.fillColor('black');
      }
      doc.text(cell, currentX, currentY + 6);
      currentX += colWidths[i];
    });
    
    currentY += 20;
    
    // Add new page if needed
    if (currentY > doc.page.height - 100) {
      doc.addPage();
      currentY = 30;
    }
  });
  
  // Footer
  doc.fontSize(10).fillColor('#6b7280').text(
    `Page ${doc.bufferedPageRange().count} of ${doc.bufferedPageRange().count}`,
    30,
    doc.page.height - 50,
    { align: 'center' }
  );
  
  doc.end();
}

// Helper function to generate CSV from businesses
function generateBusinessesCSV(businesses) {
  const headers = ['Business ID', 'Business Name', 'Owner Name', 'Owner Email', 'Status', 'Total Orders', 'Created At'];
  const csvRows = [headers.join(',')];
  
  businesses.forEach(business => {
    const row = [
      business.business_id || '',
      `"${(business.business_name || '').replace(/"/g, '""')}"`,
      `"${(business.owner_name || '').replace(/"/g, '""')}"`,
      business.owner_email || '',
      business.is_active ? 'Active' : 'Inactive',
      business.total_orders || 0,
      business.created_at ? (business.created_at instanceof Date ? business.created_at.toLocaleString() : new Date(business.created_at).toLocaleString()) : ''
    ];
    csvRows.push(row.join(','));
  });
  
  return csvRows.join('\n');
}

// Helper function to generate PDF from businesses
function generateBusinessesPDF(businesses, res) {
  const doc = new PDFDocument({ 
    margin: 30, 
    size: 'A4',
    layout: 'portrait'
  });
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="businesses.pdf"');
  doc.pipe(res);

  // Header with styling
  doc.rect(0, 0, doc.page.width, 80).fill('#2563eb');
  doc.fontSize(24).fillColor('white').text('Businesses Report', 30, 25, { align: 'center' });
  doc.fontSize(12).text(`Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 30, 55, { align: 'center' });
  
  // Reset colors
  doc.fillColor('black');
  
  // Summary section
  doc.moveDown(2);
  doc.fontSize(16).font('Helvetica-Bold').text('Summary', { underline: true });
  doc.moveDown(0.5);
  
  const totalBusinesses = businesses.length;
  const activeBusinesses = businesses.filter(b => b.is_active).length;
  const totalOrders = businesses.reduce((sum, b) => sum + (parseInt(b.total_orders) || 0), 0);
  
  doc.fontSize(12).font('Helvetica');
  doc.text(`Total Businesses: ${totalBusinesses}`, { continued: true });
  doc.text(`  |  `, { continued: true });
  doc.text(`Active: ${activeBusinesses}`, { continued: true });
  doc.text(`  |  `, { continued: true });
  doc.text(`Inactive: ${totalBusinesses - activeBusinesses}`, { continued: true });
  doc.text(`  |  `, { continued: true });
  doc.text(`Total Orders: ${totalOrders}`);
  
  // Status distribution chart
  doc.moveDown(1);
  doc.fontSize(14).font('Helvetica-Bold').text('Business Status Distribution', { underline: true });
  doc.moveDown(0.5);
  
  const chartWidth = 300;
  const chartHeight = 100;
  const chartX = 50;
  const chartY = doc.y;
  
  // Draw chart background
  doc.rect(chartX, chartY, chartWidth, chartHeight).stroke('#e5e7eb');
  
  // Draw pie chart segments
  const centerX = chartX + chartWidth / 2;
  const centerY = chartY + chartHeight / 2;
  const radius = Math.min(chartWidth, chartHeight) / 2 - 20;
  
  if (totalBusinesses > 0) {
    const activeAngle = (activeBusinesses / totalBusinesses) * 2 * Math.PI;
    const inactiveAngle = ((totalBusinesses - activeBusinesses) / totalBusinesses) * 2 * Math.PI;
    
    // Active businesses (green)
    if (activeBusinesses > 0) {
      doc.arc(centerX, centerY, radius, 0, activeAngle).fill('#10b981');
    }
    
    // Inactive businesses (red)
    if (totalBusinesses - activeBusinesses > 0) {
      doc.arc(centerX, centerY, radius, activeAngle, activeAngle + inactiveAngle).fill('#ef4444');
    }
    
    // Legend
    doc.fontSize(10).fillColor('#10b981');
    doc.rect(chartX + chartWidth + 20, chartY, 15, 15).fill('#10b981');
    doc.fillColor('black').text(`Active (${activeBusinesses})`, chartX + chartWidth + 40, chartY + 2);
    
    doc.fillColor('#ef4444');
    doc.rect(chartX + chartWidth + 20, chartY + 25, 15, 15).fill('#ef4444');
    doc.fillColor('black').text(`Inactive (${totalBusinesses - activeBusinesses})`, chartX + chartWidth + 40, chartY + 27);
  }
  
  doc.moveDown(3);
  
  // Businesses table
  doc.fontSize(16).font('Helvetica-Bold').text('Business Details', { underline: true });
  doc.moveDown(0.5);
  
  if (businesses.length === 0) {
    doc.fontSize(12).font('Helvetica').text('No businesses found for the selected criteria.');
    doc.end();
    return;
  }
  
  // Table styling
  const tableTop = doc.y;
  const tableLeft = 30;
  const tableWidth = doc.page.width - 60;
  const colWidths = [80, 120, 100, 120, 60, 80, 80]; // Adjusted column widths
  const headers = ['Business ID', 'Business Name', 'Owner', 'Email', 'Status', 'Orders', 'Created'];
  
  // Draw table header
  doc.rect(tableLeft, tableTop, tableWidth, 25).fill('#f3f4f6');
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#374151');
  
  let currentX = tableLeft + 5;
  headers.forEach((header, i) => {
    doc.text(header, currentX, tableTop + 8);
    currentX += colWidths[i];
  });
  
  // Draw table rows
  doc.fontSize(9).font('Helvetica').fillColor('black');
  let currentY = tableTop + 25;
  
  businesses.forEach((business, index) => {
    // Alternate row colors
    if (index % 2 === 0) {
      doc.rect(tableLeft, currentY, tableWidth, 20).fill('#f9fafb');
    }
    
    // Status color coding
    const statusColor = business.is_active ? '#10b981' : '#ef4444';
    
    const rowData = [
      business.business_id || 'N/A',
      (business.business_name || 'N/A').substring(0, 20),
      (business.owner_name || 'N/A').substring(0, 15),
      (business.owner_email || 'N/A').substring(0, 20),
      business.is_active ? 'Active' : 'Inactive',
      business.total_orders || 0,
      business.created_at ? (business.created_at instanceof Date ? business.created_at.toLocaleDateString() : new Date(business.created_at).toLocaleDateString()) : 'N/A'
    ];
    
    currentX = tableLeft + 5;
    rowData.forEach((cell, i) => {
      if (i === 4) { // Status column
        doc.fillColor(statusColor);
      } else {
        doc.fillColor('black');
      }
      doc.text(cell, currentX, currentY + 6);
      currentX += colWidths[i];
    });
    
    currentY += 20;
    
    // Add new page if needed
    if (currentY > doc.page.height - 100) {
      doc.addPage();
      currentY = 30;
    }
  });
  
  // Footer
  doc.fontSize(10).fillColor('#6b7280').text(
    `Page ${doc.bufferedPageRange().count} of ${doc.bufferedPageRange().count}`,
    30,
    doc.page.height - 50,
    { align: 'center' }
  );
  
  doc.end();
}

module.exports = {
  generateOrdersCSV,
  generateOrdersPDF,
  generateBusinessesCSV,
  generateBusinessesPDF
}; 