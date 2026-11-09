(function(){
    "use strict";
    // Keep existing step IDs so saved guide progress survives plan regrouping.
    const frames = {
  "dashboard": {
    "width": 1363,
    "height": 936,
    "crop": [
      0,
      0,
      1363,
      936
    ],
    "label": "Start on the dashboard"
  },
  "locations": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Set up a location"
  },
  "add-stock": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Add your first item"
  },
  "search-stock": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Find and move stock"
  },
  "move-stock": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Find and move stock"
  },
  "remove-stock": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Remove or discard stock"
  },
  "consolidated-picking": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Remove or discard stock"
  },
  "stack-order": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Set your stack order"
  },
  "locked-picking": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Consolidate a stock pick"
  },
  "stale-stock": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Review slow-moving items"
  },
  "settings-help": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Get help inside Settings"
  },
  "sales-tracker": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "See full sales history"
  },
  "expenses": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Record expenses and refunds"
  },
  "reorder-expense": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Record expenses and refunds"
  },
  "barcode-printing": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Make barcode labels"
  },
  "print-jobs": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Reuse a print job"
  },
  "dispatch": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Pack and print shipping labels"
  },
  "dispatch-actions": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Pack and print shipping labels"
  },
  "workspace-settings": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Choose location wording"
  },
  "email-import": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Email shipping labels to your workspace"
  },
  "email-progress": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Reimport labels and watch progress"
  },
  "reorder-rule": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Create a reorder rule"
  },
  "reorder-ordered": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Edit the cost of an ordered item"
  },
  "reorder-receive": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Confirm receipt and create expenses"
  },
  "reorder-assignment": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Assign received stock from Holding"
  },
  "workspace-invites": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Share a workspace"
  },
  "workspace-members": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Manage workspace inventories"
  },
  "manufacturing-setup": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Enable Manufacturing mode"
  },
  "manufacturing-materials": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Receive measured materials"
  },
  "manufacturing-recipes": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Create a product recipe"
  },
  "manufacturing-calculator": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Calculate and combine material orders"
  },
  "manufacturing-production": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Preview and complete production"
  },
  "manufacturing-batches": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Trace, hold or recall batches"
  },
  "manufacturing-timer": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Set a timer that continues after logout"
  },
  "manufacturing-equipment": {
    "width": 1363,
    "height": 936,
    "crop": [
      245,
      76,
      1103,
      860
    ],
    "label": "Track equipment uses and maintenance"
  },
  "seller-centre": {
    "width": 1363,
    "height": 936,
    "crop": [
      0,
      0,
      1363,
      936
    ],
    "label": "Set up a Mi Marché storefront"
  },
  "storefront-collection": {
    "width": 1363,
    "height": 936,
    "crop": [
      0,
      0,
      1363,
      936
    ],
    "label": "Offer free collection"
  }
};
    const stages = [
  {
    "id": "free",
    "name": "Free",
    "subtitle": "Get your first item in and out",
    "color": "#20c997",
    "steps": [
      {
        "points": [
          {
            "title": "Check your workspace",
            "detail": "The top bar shows the workspace and inventory you are viewing.",
            "x": 59.9,
            "y": 22.3,
            "rect": {
              "x": 57.7,
              "y": 20.1,
              "width": 13,
              "height": 4.5
            }
          },
          {
            "title": "Read the stock total",
            "detail": "Active stock is the number of units currently held.",
            "x": 23.1,
            "y": 42.6,
            "rect": {
              "x": 20.9,
              "y": 34.4,
              "width": 24.4,
              "height": 16.3
            }
          },
          {
            "title": "Spot recent activity",
            "detail": "Use the summary and recent activity to check what changed."
          }
        ],
        "id": "free:Start on the dashboard",
        "title": "Start on the dashboard",
        "description": "See what is in stock and check the workspace you are working in.",
        "url": "index.html",
        "audience": "all",
        "capture": "dashboard"
      },
      {
        "points": [
          {
            "title": "Create a location",
            "detail": "Select Create Box or Create Shelf, depending on your location wording. Choose a location name or use the next available number.",
            "x": 6.3,
            "y": 36.6,
            "rect": {
              "x": 3.6,
              "y": 33.7,
              "width": 46.1,
              "height": 5.7
            }
          },
          {
            "title": "Open its contents",
            "detail": "Select View Contents to see what is stored there."
          },
          {
            "title": "Check empty locations",
            "detail": "The empty-locations view shows space available for future stock.",
            "x": 29.8,
            "y": 56.3,
            "rect": {
              "x": 27.1,
              "y": 50.3,
              "width": 22.6,
              "height": 12
            }
          }
        ],
        "id": "free:Set up a location",
        "title": "Set up a location",
        "description": "Give your first box, shelf or rack a place to live in InventoryOS.",
        "url": "boxes.html",
        "audience": "all",
        "capture": "locations"
      },
      {
        "points": [
          {
            "title": "Name the product",
            "detail": "Start typing to reuse a matching product, or create a new name.",
            "x": 8.4,
            "y": 43,
            "rect": {
              "x": 5.7,
              "y": 40.3,
              "width": 88.9,
              "height": 5.3
            }
          },
          {
            "title": "Set quantity and location",
            "detail": "Use the quantity and location fields to say what arrived and where it went.",
            "x": 8.4,
            "y": 54.4,
            "rect": {
              "x": 5.7,
              "y": 51.7,
              "width": 44,
              "height": 5.3
            }
          },
          {
            "title": "Save Product",
            "detail": "Saving stock updates your inventory. Label options are available on eligible paid plans.",
            "x": 8.4,
            "y": 86,
            "rect": {
              "x": 5.7,
              "y": 82.7,
              "width": 88.9,
              "height": 6.6
            }
          }
        ],
        "id": "free:Add your first item",
        "title": "Add your first item",
        "description": "Save a clear name, the number of units and where they are stored.",
        "url": "add.html",
        "audience": "all",
        "capture": "add-stock"
      },
      {
        "points": [
          {
            "title": "Search by name or barcode",
            "detail": "Scan a barcode or type part of the name, then press Search.",
            "x": 8.4,
            "y": 36,
            "rect": {
              "x": 5.7,
              "y": 33.3,
              "width": 88.9,
              "height": 5.6
            }
          },
          {
            "title": "Open Move Stock",
            "detail": "Choose a source, destination and quantity before confirming a move.",
            "frame": "move-stock",
            "x": 76.9,
            "y": 28.1,
            "rect": {
              "x": 74.2,
              "y": 25.5,
              "width": 22.6,
              "height": 5.3
            }
          }
        ],
        "id": "free:Find and move stock",
        "title": "Find and move stock",
        "description": "Search before you pick, and record a move when the physical location changes.",
        "url": "search.html",
        "audience": "all",
        "capture": "search-stock"
      },
      {
        "points": [
          {
            "title": "Find the sold item",
            "detail": "Search, choose the right result and add it to the bundle.",
            "x": 8.4,
            "y": 30.2,
            "rect": {
              "x": 5.7,
              "y": 27.4,
              "width": 88.9,
              "height": 5.6
            }
          },
          {
            "title": "Review the bundle",
            "detail": "Set quantities and check the suggested pick locations before confirming.",
            "frame": "consolidated-picking",
            "x": 9.8,
            "y": 45.6,
            "rect": {
              "x": 7.1,
              "y": 42.8,
              "width": 86.2,
              "height": 5.6
            }
          },
          {
            "title": "Discard is separate",
            "detail": "Broken, lost or donated stock belongs in Discard Stock, not a sale."
          }
        ],
        "id": "free:Remove or discard stock",
        "title": "Remove or discard stock",
        "description": "Record a sale through Remove Stock. Use Discard Stock for damaged or lost items.",
        "url": "remove.html",
        "audience": "all",
        "capture": "remove-stock"
      },
      {
        "points": [
          {
            "title": "Open Stack order",
            "detail": "Open Settings, choose Stack order, and select one inventory.",
            "x": 36.1,
            "y": 27.3,
            "rect": {
              "x": 33.4,
              "y": 25.1,
              "width": 9.2,
              "height": 4.3
            }
          },
          {
            "title": "Set the height",
            "detail": "Set a default height, add each stack and adjust its own height if needed.",
            "x": 8.3,
            "y": 55.6,
            "rect": {
              "x": 5.6,
              "y": 50.7,
              "width": 54.1,
              "height": 9.8
            }
          },
          {
            "title": "Arrange top to bottom",
            "detail": "Choose the location at each position. Blank positions are empty space. Use your actual box, shelf or rack order.",
            "x": 10.1,
            "y": 82.3,
            "rect": {
              "x": 7.3,
              "y": 78.6,
              "width": 85.7,
              "height": 7.3
            }
          },
          {
            "title": "Save the layout",
            "detail": "Save stack order. Picking minimises locations first, then prefers easier stack access, then empties smaller item stocks.",
            "x": 85,
            "y": 58.1,
            "rect": {
              "x": 82.3,
              "y": 55.8,
              "width": 12.4,
              "height": 4.7
            }
          }
        ],
        "id": "free:stack-order",
        "title": "Set your stack order",
        "description": "Tell InventoryOS which locations are easiest to reach. The top position has nothing above it.",
        "url": "settings.html",
        "audience": "all",
        "capture": "stack-order"
      },
      {
        "points": [
          {
            "title": "Consolidate picking plan",
            "detail": "Add your items and quantities first, then press Consolidate picking plan.",
            "x": 9.8,
            "y": 45.6,
            "rect": {
              "x": 7.1,
              "y": 42.8,
              "width": 86.2,
              "height": 5.6
            }
          },
          {
            "title": "Follow the grouped route",
            "detail": "The route groups items by pick location. This example picks Bread bags from Shelf 1.",
            "x": 9.8,
            "y": 56.1,
            "rect": {
              "x": 7.1,
              "y": 54.8,
              "width": 86.2,
              "height": 2.7
            }
          },
          {
            "title": "Yellow means another location is available",
            "detail": "Select a yellow item to see the places it can be picked from. Stock has not changed yet.",
            "x": 11.2,
            "y": 73.5,
            "rect": {
              "x": 8.4,
              "y": 67.8,
              "width": 83.5,
              "height": 11.4
            }
          },
          {
            "title": "Confirm the removal",
            "detail": "Check quantities, locations and any sale amount. Only Remove Stock commits the stock change.",
            "frame": "locked-picking",
            "x": 8.4,
            "y": 91.6,
            "rect": {
              "x": 5.7,
              "y": 88.8,
              "width": 88.9,
              "height": 5.6
            }
          }
        ],
        "id": "free:consolidate",
        "title": "Consolidate a stock pick",
        "description": "Set every item quantity, then review exactly where the stock will come from before removing anything.",
        "url": "remove.html",
        "audience": "all",
        "capture": "consolidated-picking"
      },
      {
        "points": [
          {
            "title": "Your chosen location is locked",
            "detail": "Select a yellow item and choose an available location. In this example Bread bags are locked to Shelf 2.",
            "x": 11.2,
            "y": 53.4,
            "rect": {
              "x": 8.4,
              "y": 47.7,
              "width": 83.5,
              "height": 11.4
            }
          },
          {
            "title": "The other items are reconsolidated",
            "detail": "The route keeps the chosen pick and groups other items wherever possible. A manual choice can add another location.",
            "x": 9.8,
            "y": 36,
            "rect": {
              "x": 7.1,
              "y": 34.7,
              "width": 86.2,
              "height": 2.7
            }
          },
          {
            "title": "Return to automatic picking",
            "detail": "Use automatic picking removes the manual lock and calculates the suggested route again.",
            "x": 81.1,
            "y": 29.9,
            "rect": {
              "x": 78.4,
              "y": 28,
              "width": 13.7,
              "height": 3.7
            }
          }
        ],
        "id": "free:lock-pick",
        "title": "Choose a different picking location",
        "description": "Lock one item to your chosen location, then let InventoryOS recalculate the rest of the route.",
        "url": "remove.html",
        "audience": "all",
        "capture": "locked-picking"
      },
      {
        "points": [
          {
            "title": "Refresh the report",
            "detail": "See the latest items that meet the stale-stock threshold.",
            "x": 6.3,
            "y": 40,
            "rect": {
              "x": 3.6,
              "y": 37.2,
              "width": 94.5,
              "height": 5.6
            }
          },
          {
            "title": "Review each card",
            "detail": "Check the item, barcode, location, quantity and age before acting.",
            "x": 6.3,
            "y": 62.5,
            "rect": {
              "x": 3.6,
              "y": 46.7,
              "width": 94.5,
              "height": 31.5
            }
          }
        ],
        "id": "free:Review slow-moving items",
        "title": "Review slow-moving items",
        "description": "The Stale Stock report flags items that have been sitting without a sale.",
        "url": "stale.html",
        "audience": "all",
        "capture": "stale-stock"
      },
      {
        "points": [
          {
            "title": "Open Help",
            "detail": "Go to Settings and select Help. Replies go to your account email.",
            "x": 30,
            "y": 27.3,
            "rect": {
              "x": 27.4,
              "y": 25.1,
              "width": 5.3,
              "height": 4.3
            }
          },
          {
            "title": "Describe the topic",
            "detail": "Choose a short topic and explain which page you used, what you tried and what happened.",
            "x": 8.4,
            "y": 67.7,
            "rect": {
              "x": 5.7,
              "y": 66.4,
              "width": 43.9,
              "height": 2.6
            }
          },
          {
            "title": "Send the request",
            "detail": "Check the selected workspace, then send. Your account and workspace are attached automatically."
          },
          {
            "title": "Follow its progress",
            "detail": "Recent requests show their status. Open a request to review its details.",
            "x": 58.1,
            "y": 45.4,
            "rect": {
              "x": 55.4,
              "y": 43.8,
              "width": 39.3,
              "height": 3.1
            }
          }
        ],
        "id": "free:help",
        "title": "Get help inside Settings",
        "description": "Send a topic and message, then track the request in your recent requests.",
        "url": "settings.html",
        "audience": "all",
        "capture": "settings-help"
      }
    ]
  },
  {
    "id": "starter",
    "name": "Starter",
    "subtitle": "Selling, costs, labels and dispatch",
    "color": "#4da3ff",
    "steps": [
      {
        "points": [
          {
            "title": "All-time figures",
            "detail": "See total income, expenses and profit in one place."
          },
          {
            "title": "This month's figures",
            "detail": "Review the current period before opening recent sales below.",
            "x": 6.3,
            "y": 59.5,
            "rect": {
              "x": 3.6,
              "y": 57.9,
              "width": 93.1,
              "height": 3.1
            }
          }
        ],
        "id": "starter:See full sales history",
        "title": "See full sales history",
        "description": "Compare income, expenses and profit, then review recent sales.",
        "url": "salestracker.html",
        "audience": "all",
        "capture": "sales-tracker"
      },
      {
        "points": [
          {
            "title": "Describe the cost",
            "detail": "Choose a category, date and optional payment method.",
            "x": 8.3,
            "y": 43.1,
            "rect": {
              "x": 5.6,
              "y": 40.3,
              "width": 89.1,
              "height": 5.6
            }
          },
          {
            "title": "Attach a receipt",
            "detail": "Upload an image or PDF if you need to keep the receipt with the expense.",
            "frame": "reorder-expense",
            "x": 89.3,
            "y": 58.8,
            "rect": {
              "x": 86.6,
              "y": 55.7,
              "width": 8.2,
              "height": 6.3
            }
          }
        ],
        "id": "starter:Record expenses and refunds",
        "title": "Record expenses and refunds",
        "description": "Keep costs and returned sales in the right inventory.",
        "url": "expenses.html",
        "audience": "all",
        "capture": "expenses"
      },
      {
        "points": [
          {
            "title": "Choose a label tab",
            "detail": "Product Labels, Box Labels and Bulk Range each serve a different job.",
            "x": 6.3,
            "y": 28.8,
            "rect": {
              "x": 3.6,
              "y": 26.2,
              "width": 18.1,
              "height": 5.3
            }
          },
          {
            "title": "Open Print Jobs",
            "detail": "Saved jobs hold batches you want to load and print again.",
            "x": 63.6,
            "y": 28.8,
            "rect": {
              "x": 60.8,
              "y": 26.2,
              "width": 18.1,
              "height": 5.3
            }
          }
        ],
        "id": "starter:Make barcode labels",
        "title": "Make barcode labels",
        "description": "Print product or location labels, or generate a numbered range.",
        "url": "barcodeprinting.html",
        "audience": "all",
        "capture": "barcode-printing"
      },
      {
        "points": [
          {
            "title": "Select a saved job",
            "detail": "Choose its name from the Print Job list.",
            "x": 8.4,
            "y": 40.3,
            "rect": {
              "x": 5.7,
              "y": 37.4,
              "width": 88.9,
              "height": 5.7
            }
          },
          {
            "title": "Load and check",
            "detail": "Load Print Job, then review the loaded labels before printing.",
            "x": 8.4,
            "y": 48,
            "rect": {
              "x": 5.7,
              "y": 45.2,
              "width": 88.9,
              "height": 5.6
            }
          },
          {
            "title": "Print or delete",
            "detail": "Print Loaded Labels makes the batch. Delete Print Job removes the saved job, not the stock.",
            "x": 8.4,
            "y": 55.7,
            "rect": {
              "x": 5.7,
              "y": 52.9,
              "width": 88.9,
              "height": 5.6
            }
          }
        ],
        "id": "starter:Reuse a print job",
        "title": "Reuse a print job",
        "description": "Load the saved batch, check it, print it, or delete it when you no longer need it.",
        "url": "barcodeprinting.html",
        "audience": "all",
        "capture": "print-jobs"
      },
      {
        "points": [
          {
            "title": "Upload and review",
            "detail": "Open Import label files, choose a PDF or image, select Preview crop and then Add to queue after checking the result.",
            "x": 8.1,
            "y": 77.8,
            "rect": {
              "x": 5.3,
              "y": 75.5,
              "width": 9.2,
              "height": 4.7
            }
          },
          {
            "title": "Choose a picking order",
            "detail": "Use Find stock locations, then choose By location for a pick run or By label to follow the label order.",
            "frame": "dispatch-actions",
            "x": 9.1,
            "y": 53.1,
            "rect": {
              "x": 6.3,
              "y": 51.2,
              "width": 7.9,
              "height": 4
            }
          },
          {
            "title": "Print from your phone",
            "detail": "Open More actions and choose Mobile print labels. You can also open Shipping labels & printing for its preview and mobile actions.",
            "frame": "dispatch-actions",
            "x": 76.6,
            "y": 70.1,
            "rect": {
              "x": 73.9,
              "y": 67.8,
              "width": 19.9,
              "height": 4.7
            }
          }
        ],
        "id": "starter:Pack and print shipping labels",
        "title": "Pack and print shipping labels",
        "description": "Upload a label, check its crop, then use the Packing Queue controls.",
        "url": "dispatch-centre.html",
        "audience": "all",
        "capture": "dispatch"
      }
    ]
  },
  {
    "id": "complete",
    "name": "Complete",
    "subtitle": "Team, production, shops and advanced workflows",
    "color": "#b56cff",
    "steps": [
      {
        "points": [
          {
            "title": "Inventory selector",
            "detail": "Confirm the inventory before adding, moving, removing or assigning stock.",
            "x": 73.7,
            "y": 22.3,
            "rect": {
              "x": 71.5,
              "y": 20.1,
              "width": 11.3,
              "height": 4.5
            }
          },
          {
            "title": "Workspace selector",
            "detail": "A workspace is the surrounding account or team context.",
            "x": 59.9,
            "y": 22.3,
            "rect": {
              "x": 57.7,
              "y": 20.1,
              "width": 13,
              "height": 4.5
            }
          }
        ],
        "id": "pro:Choose the right inventory",
        "title": "Choose the right inventory",
        "description": "Keep separate stock holdings in the same workspace and switch at the top.",
        "url": "index.html",
        "audience": "all",
        "capture": "dashboard"
      },
      {
        "points": [
          {
            "title": "Choose a preset",
            "detail": "Pick Boxes, Shelves, Racks or custom wording.",
            "x": 6.3,
            "y": 48.3,
            "rect": {
              "x": 3.6,
              "y": 45.5,
              "width": 93.1,
              "height": 5.7
            }
          },
          {
            "title": "Check singular and plural",
            "detail": "Numeric locations display using the preferred wording.",
            "x": 6.3,
            "y": 59.2,
            "rect": {
              "x": 3.6,
              "y": 56.4,
              "width": 93.1,
              "height": 5.6
            }
          },
          {
            "title": "Save Settings",
            "detail": "A specifically saved name such as Box 1 keeps its own wording."
          }
        ],
        "id": "pro:Choose location wording",
        "title": "Choose location wording",
        "description": "Use shelves or racks instead of boxes wherever a number is displayed.",
        "url": "workspace-settings.html",
        "audience": "all",
        "capture": "workspace-settings"
      },
      {
        "points": [
          {
            "title": "Copy the shared address",
            "detail": "Create the address in Settings or Dispatch Centre. Everyone in the workspace uses the same one.",
            "x": 87.9,
            "y": 21.4,
            "rect": {
              "x": 85.1,
              "y": 19.1,
              "width": 9.9,
              "height": 4.7
            }
          },
          {
            "title": "Forward label attachments",
            "detail": "Send PDF, PNG or JPEG attachments from any email provider. Use a shipping-label filter for automatic forwarding.",
            "x": 55.3,
            "y": 39.8,
            "rect": {
              "x": 52.6,
              "y": 38.7,
              "width": 42.5,
              "height": 2.2
            }
          },
          {
            "title": "Review and print",
            "detail": "The backend crops labels into the Packing Queue. Confirm the item and location, then print on mobile or with QZ Tray.",
            "frame": "dispatch-actions",
            "x": 8.6,
            "y": 43.5,
            "rect": {
              "x": 5.9,
              "y": 42.1,
              "width": 23.5,
              "height": 2.9
            }
          }
        ],
        "id": "pro:Email shipping labels to your workspace",
        "title": "Email shipping labels to your workspace",
        "description": "Forward supported shipping-label attachments to your workspace email address. This is included with Complete.",
        "url": "dispatch-centre.html",
        "audience": "all",
        "capture": "email-import"
      },
      {
        "points": [
          {
            "title": "Choose the number of recent emails",
            "detail": "Use the previous-email count for the label emails you want to reimport. Check the queue first to avoid unnecessary reprints."
          },
          {
            "title": "Reimport and crop again",
            "detail": "Start reimporting. This retries label attachments and cropping; it is separate from a stock removal.",
            "x": 55.3,
            "y": 62.6,
            "rect": {
              "x": 52.6,
              "y": 60.2,
              "width": 16.1,
              "height": 4.7
            }
          },
          {
            "title": "Watch label import progress",
            "detail": "The progress panel records processing and completion. These are recorded test screenshots, not a live import running in this guide.",
            "frame": "email-progress",
            "x": 55.3,
            "y": 45.5,
            "rect": {
              "x": 52.6,
              "y": 44.3,
              "width": 16,
              "height": 2.4
            }
          },
          {
            "title": "Clear completed activity",
            "detail": "Completed progress stays visible for five minutes. Clear now dismisses completed activity; it does not delete labels or stock.",
            "frame": "email-progress",
            "x": 89.6,
            "y": 46.6,
            "rect": {
              "x": 86.9,
              "y": 44.3,
              "width": 8.2,
              "height": 4.7
            }
          }
        ],
        "id": "pro:reimport",
        "title": "Reimport labels and watch progress",
        "description": "Choose how many recent shipping-label emails to process again, then watch their progress in Dispatch Centre.",
        "url": "dispatch-centre.html",
        "audience": "all",
        "capture": "email-import"
      },
      {
        "points": [
          {
            "title": "Choose the item",
            "detail": "Reuse a suggested item or create a new one. It will also appear in Add Stock suggestions.",
            "x": 6.3,
            "y": 26.2,
            "rect": {
              "x": 3.6,
              "y": 24.9,
              "width": 93.1,
              "height": 2.6
            }
          },
          {
            "title": "Add a buying link",
            "detail": "Enter a product link or supplier website link. At least one is required; supplier contact details are optional.",
            "x": 6.3,
            "y": 39.1,
            "rect": {
              "x": 3.6,
              "y": 37.8,
              "width": 93.1,
              "height": 2.6
            }
          },
          {
            "title": "Set minimum and target stock",
            "detail": "Stock at or below the minimum triggers a reorder. Reorder up to is the target after replenishment.",
            "x": 6.3,
            "y": 85.2,
            "rect": {
              "x": 3.6,
              "y": 84,
              "width": 93.1,
              "height": 2.6
            }
          },
          {
            "title": "Cost per unit is optional",
            "detail": "Use the expected unit cost to estimate the total. If unknown, leave it blank and enter the actual total before receipt."
          },
          {
            "title": "Save the rule",
            "detail": "Save. Use Adjustments on Reordering to edit or delete a rule later."
          }
        ],
        "id": "pro:reorder-rule",
        "title": "Create a reorder rule",
        "description": "Choose a supplier, stock thresholds and an optional estimated cost per unit.",
        "url": "reorder-rule.html",
        "audience": "all",
        "legacyId": "pro:Create a reorder rule",
        "capture": "reorder-rule"
      },
      {
        "points": [
          {
            "title": "Open Ordered",
            "detail": "Mark the low-stock item Ordered. It leaves Needs reordering and appears in this tab.",
            "x": 21.5,
            "y": 40.4,
            "rect": {
              "x": 18.8,
              "y": 38.4,
              "width": 9.1,
              "height": 4.1
            }
          },
          {
            "title": "Enter the total paid",
            "detail": "You can include delivery costs or discounts. The effective cost per unit is calculated from the total and ordered quantity.",
            "x": 8.3,
            "y": 86.4,
            "rect": {
              "x": 5.6,
              "y": 85.1,
              "width": 26.3,
              "height": 2.6
            }
          },
          {
            "title": "Save cost",
            "detail": "Save the edited total before receiving. Editing the order does not change the rule for future orders.",
            "x": 26.4,
            "y": 90.9,
            "rect": {
              "x": 23.7,
              "y": 88.5,
              "width": 8.2,
              "height": 4.9
            }
          },
          {
            "title": "Select orders to receive",
            "detail": "Select the delivered orders and choose Mark selected received.",
            "x": 26.5,
            "y": 48.8,
            "rect": {
              "x": 23.8,
              "y": 46.7,
              "width": 15.8,
              "height": 4.1
            }
          }
        ],
        "id": "pro:ordered-cost",
        "title": "Edit the cost of an ordered item",
        "description": "Mark a needed item Ordered, then save the total amount you actually paid.",
        "url": "reorders.html",
        "audience": "all",
        "capture": "reorder-ordered"
      },
      {
        "points": [
          {
            "title": "Check the item and quantity",
            "detail": "Confirm the selected item and number of units actually arrived.",
            "x": 19.9,
            "y": 26.1,
            "rect": {
              "x": 17.2,
              "y": 24.5,
              "width": 43.3,
              "height": 3.1
            }
          },
          {
            "title": "Confirm the final cost",
            "detail": "Enter the total paid, including when no estimated cost was set. Use 0 only for an order that was free.",
            "x": 19.9,
            "y": 44.3,
            "rect": {
              "x": 17.2,
              "y": 43,
              "width": 43.3,
              "height": 2.6
            }
          },
          {
            "title": "Holding and expenses",
            "detail": "Confirmation adds stock to Holding and creates one expense per order, with quantity, total and cost per unit."
          },
          {
            "title": "Confirm received",
            "detail": "Confirm once. If the save fails, stock and expense changes are rolled back together; repeating receipt cannot add them twice.",
            "x": 19.9,
            "y": 64.8,
            "rect": {
              "x": 17.2,
              "y": 62.7,
              "width": 12.4,
              "height": 4.3
            }
          }
        ],
        "id": "pro:receive-cost",
        "title": "Confirm receipt and create expenses",
        "description": "Physically check the delivery, then confirm each total paid. Stock and its expense are saved together.",
        "url": "reorders.html",
        "audience": "all",
        "capture": "reorder-receive"
      },
      {
        "points": [
          {
            "title": "Find the automatic expense",
            "detail": "Look for Reorder received. The example shows 10 units at £40 each, totalling £400."
          },
          {
            "title": "Check the total",
            "detail": "The final confirmed order cost is included in expense totals."
          },
          {
            "title": "Attach receipt",
            "detail": "Choose Attach receipt to add the supplier image or PDF. You do not need to create this expense again.",
            "x": 89.3,
            "y": 58.8,
            "rect": {
              "x": 86.6,
              "y": 55.7,
              "width": 8.2,
              "height": 6.3
            }
          }
        ],
        "id": "pro:reorder-expense",
        "title": "Attach the reorder receipt",
        "description": "The expense already contains the item name, ordered quantity, total cost and cost per unit.",
        "url": "expenses.html",
        "audience": "all",
        "capture": "reorder-expense"
      },
      {
        "points": [
          {
            "title": "Open Destination assigning",
            "detail": "Received whole-item orders wait here until their stock is placed.",
            "x": 31.4,
            "y": 12,
            "rect": {
              "x": 28.6,
              "y": 10,
              "width": 16.9,
              "height": 4.1
            }
          },
          {
            "title": "Split the quantity",
            "detail": "Choose each destination and quantity. The combined amount cannot exceed the unassigned quantity. Ten units can be split as six and four.",
            "x": 8.3,
            "y": 49.7,
            "rect": {
              "x": 5.6,
              "y": 47.6,
              "width": 7.7,
              "height": 4.3
            }
          },
          {
            "title": "Confirm locations or print labels",
            "detail": "Only assigned quantities move. The remainder stays in Holding. Mobile and QZ Tray printing are manual actions here.",
            "x": 8.3,
            "y": 60.4,
            "rect": {
              "x": 5.6,
              "y": 58.4,
              "width": 18.4,
              "height": 4.1
            }
          }
        ],
        "id": "pro:Assign received stock from Holding",
        "title": "Assign received stock from Holding",
        "description": "After receipt, split the quantity between final locations. Unassigned units remain in Holding.",
        "url": "reorders.html",
        "audience": "all",
        "legacyId": "pro:Order, receive and assign",
        "capture": "reorder-assignment"
      },
      {
        "title": "Choose email reminder timing",
        "description": "Complete includes reminder emails, sent immediately or as one daily summary. Existing legacy plans keep their add-on arrangements.",
        "demo": "reminders",
        "url": "reorders.html",
        "points": [
          {
            "title": "Turn reminders on",
            "detail": "Complete includes reorder emails. Turn the reminders on in Reordering → Email reminders. Alerts go to your account email, not to suppliers.",
            "x": 28,
            "y": 48
          },
          {
            "title": "Choose when to send",
            "detail": "Pick Instant when stock reaches minimum or a daily summary time.",
            "x": 72,
            "y": 57
          },
          {
            "title": "Save and test",
            "detail": "Save preferences, then Send test email or Check alerts now to verify the setup.",
            "x": 40,
            "y": 80
          }
        ],
        "id": "pro:Choose email reminder timing",
        "audience": "all"
      },
      {
        "points": [
          {
            "title": "Choose the invited role",
            "detail": "Select the access level before creating the invite link. Review what that role is allowed to change.",
            "x": 6.3,
            "y": 50.1,
            "rect": {
              "x": 3.6,
              "y": 48.8,
              "width": 93.1,
              "height": 2.6
            }
          },
          {
            "title": "Create the invitation",
            "detail": "Create Invite Link, then send it to the intended teammate. They join using the link or invite code.",
            "x": 6.3,
            "y": 62.3,
            "rect": {
              "x": 3.6,
              "y": 59.8,
              "width": 93.1,
              "height": 5
            }
          },
          {
            "title": "Review members",
            "detail": "Check the member name, role and status. Owners and admins can manage access according to their permissions.",
            "x": 6.3,
            "y": 98.1,
            "rect": {
              "x": 3.6,
              "y": 96.5,
              "width": 93.1,
              "height": 3.1
            }
          }
        ],
        "id": "business:workspace-members",
        "title": "Share a workspace",
        "description": "Invite people to the workspace and choose the role they need.",
        "url": "workspace-members.html",
        "audience": "all",
        "legacyId": "business:Share a workspace",
        "capture": "workspace-invites"
      },
      {
        "points": [
          {
            "title": "Check the workspace",
            "detail": "Confirm the workspace, your role, member count and inventory count before making changes.",
            "x": 6.3,
            "y": 51.3,
            "rect": {
              "x": 3.6,
              "y": 49.8,
              "width": 93.1,
              "height": 3.1
            }
          },
          {
            "title": "Name the workspace",
            "detail": "Owners and admins can rename the workspace. This changes its display name.",
            "x": 6.3,
            "y": 60.6,
            "rect": {
              "x": 3.6,
              "y": 59.3,
              "width": 93.1,
              "height": 2.6
            }
          },
          {
            "title": "Create or manage inventories",
            "detail": "Use a separate inventory for each stock holding. Select the correct one in the top bar before stock actions. Default inventories cannot be deleted.",
            "x": 6.3,
            "y": 84,
            "rect": {
              "x": 3.6,
              "y": 82.7,
              "width": 93.1,
              "height": 2.6
            }
          }
        ],
        "id": "business:workspace-inventories",
        "title": "Manage workspace inventories",
        "description": "Keep separate stock holdings organised inside the shared workspace.",
        "url": "workspace-members.html",
        "audience": "all",
        "legacyId": "business:Work from the same inventory",
        "capture": "workspace-members"
      },
      {
        "points": [
          {
            "title": "Production tools card",
            "detail": "Open Manufacturing → Start here, then use Manufacturing settings to manage access for the workspace. Production tools are included with Complete.",
            "x": 85.7,
            "y": 31.7,
            "rect": {
              "x": 83,
              "y": 30.6,
              "width": 12.9,
              "height": 2.2
            }
          },
          {
            "title": "Enable for this workspace",
            "detail": "The switch is off by default. An owner or admin enables it for everyone in this workspace."
          },
          {
            "title": "Open Manufacturing",
            "detail": "Open the page from this link or the sidebar. Select one inventory for materials, recipes and production.",
            "x": 11.8,
            "y": 56.9,
            "rect": {
              "x": 9.1,
              "y": 55,
              "width": 11,
              "height": 3.8
            }
          }
        ],
        "id": "business:manufacturing-mode",
        "title": "Enable Manufacturing mode",
        "description": "Complete includes manufacturing tools. Enable them per workspace in Settings.",
        "url": "manufacturing/index.html#setup",
        "audience": "manufacturing",
        "legacyId": "business:Enable Manufacturing mode",
        "capture": "manufacturing-setup"
      },
      {
        "points": [
          {
            "title": "Add a material",
            "detail": "Create materials using the appropriate units: each, grams, litres, metres and their compatible units. Whole-item saleable stock is tracked separately.",
            "x": 76.5,
            "y": 29.5,
            "rect": {
              "x": 73.8,
              "y": 27,
              "width": 11,
              "height": 5.1
            }
          },
          {
            "title": "Receive a batch",
            "detail": "Record its quantity, batch number, storage location and optional expiry when receiving stock.",
            "x": 88.2,
            "y": 29.5,
            "rect": {
              "x": 85.5,
              "y": 27,
              "width": 12.6,
              "height": 5.1
            }
          },
          {
            "title": "Check eligible stock",
            "detail": "Cards show what is eligible for production. Expired, held and recalled batches are excluded.",
            "x": 8.4,
            "y": 39.5,
            "rect": {
              "x": 5.7,
              "y": 38.3,
              "width": 26.1,
              "height": 2.4
            }
          },
          {
            "title": "Keep supplier details",
            "detail": "Supplier details support ordering materials. Archive a material only when it is no longer needed.",
            "x": 16.8,
            "y": 58.7,
            "rect": {
              "x": 14.1,
              "y": 56.2,
              "width": 12.6,
              "height": 5.1
            }
          }
        ],
        "id": "business:materials",
        "title": "Receive measured materials",
        "description": "Create raw materials and packaging, then record their received batches and locations.",
        "url": "manufacturing/index.html#materials",
        "audience": "manufacturing",
        "legacyId": "business:Receive measured materials",
        "capture": "manufacturing-materials"
      },
      {
        "points": [
          {
            "title": "Create a recipe",
            "detail": "Choose Create recipe. Link it to an existing finished product and barcode, or create a new finished product first.",
            "x": 72.6,
            "y": 29.5,
            "rect": {
              "x": 69.9,
              "y": 27,
              "width": 11.2,
              "height": 5.1
            }
          },
          {
            "title": "Amounts are per finished item",
            "detail": "Check every component quantity and unit. Production and the calculator multiply these amounts by the number of finished items.",
            "x": 8.4,
            "y": 39.5,
            "rect": {
              "x": 5.7,
              "y": 38.3,
              "width": 26.1,
              "height": 2.4
            }
          },
          {
            "title": "Edit or archive a recipe",
            "detail": "Edit recipe changes the definition for future work. Archive hides recipes you no longer need.",
            "x": 8.4,
            "y": 62.8,
            "rect": {
              "x": 5.7,
              "y": 60.2,
              "width": 9.4,
              "height": 5.1
            }
          }
        ],
        "id": "business:recipe",
        "title": "Create a product recipe",
        "description": "A bill of materials records the quantities required for one finished item.",
        "url": "manufacturing/index.html#recipes",
        "audience": "manufacturing",
        "legacyId": "business:Create a product recipe",
        "capture": "manufacturing-recipes"
      },
      {
        "points": [
          {
            "title": "Choose recipes and finished quantities",
            "detail": "Select a recipe and how many finished items you want. Add another recipe to plan several together.",
            "x": 6.3,
            "y": 25.8,
            "rect": {
              "x": 3.6,
              "y": 24.3,
              "width": 40,
              "height": 3
            }
          },
          {
            "title": "Calculate requirements",
            "detail": "The preview combines shared materials and considers eligible available stock and earlier pending plans.",
            "x": 21.9,
            "y": 55,
            "rect": {
              "x": 19.2,
              "y": 52.4,
              "width": 17.6,
              "height": 5.1
            }
          },
          {
            "title": "Review the combined order",
            "detail": "Compare the required, available and combined-order columns. Calculating does not consume or reserve stock.",
            "x": 82.6,
            "y": 78.6,
            "rect": {
              "x": 79.9,
              "y": 76.5,
              "width": 16.8,
              "height": 4.2
            }
          },
          {
            "title": "Add the combined plan to Reordering",
            "detail": "Save the reviewed plan. Pending unplaced material plans are consolidated; placed orders keep their agreed quantities."
          }
        ],
        "id": "business:recipe-calculator",
        "title": "Calculate and combine material orders",
        "description": "Plan one or several recipes, combine their shared ingredients and send only the shortage to Reordering.",
        "url": "manufacturing/index.html#calculate",
        "audience": "manufacturing",
        "capture": "manufacturing-calculator"
      },
      {
        "points": [
          {
            "title": "Open Reordering",
            "detail": "Open Reordering to see the saved recipe-material requirements. Mark ordered materials, receive batches, then assign their locations.",
            "x": 89.2,
            "y": 28.8,
            "rect": {
              "x": 86.5,
              "y": 27.6,
              "width": 10.2,
              "height": 2.6
            }
          },
          {
            "title": "One consolidated material plan",
            "detail": "Keep shared ingredients together rather than ordering separately for every recipe. Remove pending plans you no longer need."
          },
          {
            "title": "Daily reminder for recipe materials",
            "detail": "Complete includes recipe-material reminder emails. Materials are combined into one daily email at 17:00 UK time by default. Set a different recipe summary time in Email reminders."
          }
        ],
        "id": "business:recipe-reminders",
        "title": "Order the combined recipe materials",
        "description": "The Recipe materials section in Reordering appears only while Manufacturing mode is enabled.",
        "url": "reorders.html",
        "audience": "manufacturing",
        "capture": "manufacturing-calculator"
      },
      {
        "points": [
          {
            "title": "Check the source batches",
            "detail": "The preview names the eligible material batches that will be consumed.",
            "x": 14,
            "y": 47.9,
            "rect": {
              "x": 11.2,
              "y": 45.8,
              "width": 23.7,
              "height": 4.2
            }
          },
          {
            "title": "Follow locations and quantities",
            "detail": "Pick the listed amount from each source location. This example uses 10 kg of flour from Shelf 1.",
            "x": 37.5,
            "y": 47.9,
            "rect": {
              "x": 34.8,
              "y": 45.8,
              "width": 17,
              "height": 4.2
            }
          },
          {
            "title": "Wait until the products are ready",
            "detail": "Confirm only when the materials have been used and the finished products are ready. Start a ready timer first if they still need time."
          },
          {
            "title": "Complete production",
            "detail": "Completion deducts the materials and adds finished stock together. If the plan changes, review a fresh preview before confirming.",
            "x": 18.2,
            "y": 72.8,
            "rect": {
              "x": 15.5,
              "y": 70.2,
              "width": 16.1,
              "height": 5.1
            }
          }
        ],
        "id": "business:production",
        "title": "Preview and complete production",
        "description": "Create the run with its recipe, finished quantity, batch details and destination, then review the material picks.",
        "url": "manufacturing/index.html#production",
        "audience": "manufacturing",
        "legacyId": "business:Preview and complete production",
        "capture": "manufacturing-production"
      },
      {
        "points": [
          {
            "title": "Open a batch trace",
            "detail": "See material consumption, completed runs and finished-stock history.",
            "x": 8.4,
            "y": 64.9,
            "rect": {
              "x": 5.7,
              "y": 62.3,
              "width": 10.1,
              "height": 5.1
            }
          },
          {
            "title": "Hold or recall",
            "detail": "An owner or admin can change batch status with a reason. Source holds and recalls block affected outputs.",
            "x": 19.2,
            "y": 64.9,
            "rect": {
              "x": 16.5,
              "y": 62.3,
              "width": 11.8,
              "height": 5.1
            }
          },
          {
            "title": "Confirm batch picks",
            "detail": "When removing or moving tracked stock, confirm the exact batch numbers shown."
          }
        ],
        "id": "business:Trace, hold or recall batches",
        "title": "Trace, hold or recall batches",
        "description": "Follow a raw-material batch into finished products and their recorded stock movements.",
        "url": "manufacturing/index.html#batches",
        "audience": "manufacturing",
        "capture": "manufacturing-batches"
      },
      {
        "points": [
          {
            "title": "Name the task and type",
            "detail": "Choose a clear name and reminder type, such as Product ready or cleaning.",
            "x": 11.8,
            "y": 18.4,
            "rect": {
              "x": 9.1,
              "y": 14,
              "width": 61.1,
              "height": 8.8
            }
          },
          {
            "title": "Choose a duration",
            "detail": "Set the number and time unit for the deadline. You can choose minutes, hours or days.",
            "x": 42.9,
            "y": 39.3,
            "rect": {
              "x": 40.2,
              "y": 34.9,
              "width": 30,
              "height": 8.8
            }
          },
          {
            "title": "Optional email reminder",
            "detail": "Choose optional linked equipment and whether to email your verified account when due. The deadline continues while you are logged out.",
            "x": 11.8,
            "y": 57.3,
            "rect": {
              "x": 9.1,
              "y": 55.8,
              "width": 61.1,
              "height": 3
            }
          },
          {
            "title": "Start the timer",
            "detail": "Start timer saves the deadline. When it is due, acknowledge it and separately record cleaning or complete production.",
            "x": 91.1,
            "y": 29.5,
            "rect": {
              "x": 88.4,
              "y": 27,
              "width": 9.7,
              "height": 5.1
            }
          }
        ],
        "id": "business:timer",
        "title": "Set a timer that continues after logout",
        "description": "Use a deadline for product readiness, cleaning or another task. A timer does not automatically complete production.",
        "url": "manufacturing/index.html#timers",
        "audience": "manufacturing",
        "legacyId": "business:Maintain tools and set timers",
        "capture": "manufacturing-timer"
      },
      {
        "points": [
          {
            "title": "Register the equipment",
            "detail": "Set a use limit, an operating-hour limit or a cleaning interval for the tool.",
            "x": 88.3,
            "y": 29.5,
            "rect": {
              "x": 85.6,
              "y": 27,
              "width": 12.5,
              "height": 5.1
            }
          },
          {
            "title": "Link usage to recipes",
            "detail": "Recipes can record uses or operating hours per batch or per finished item. Completed production records that usage."
          },
          {
            "title": "Record maintenance",
            "detail": "Record cleaning or replacement when the work is actually done. Timer duration is not automatically treated as operating hours.",
            "x": 22.6,
            "y": 61.3,
            "rect": {
              "x": 19.9,
              "y": 58.7,
              "width": 7.8,
              "height": 5.1
            }
          }
        ],
        "id": "business:equipment",
        "title": "Track equipment uses and maintenance",
        "description": "Record usage and cleaning thresholds separately from elapsed reminder time.",
        "url": "manufacturing/index.html#equipment",
        "audience": "manufacturing",
        "capture": "manufacturing-equipment"
      },
      {
        "points": [
          {
            "title": "Design your shop",
            "detail": "In Shop design, set a name, add or reposition banner images and choose quick filters. Check both Desktop and Mobile in the live preview.",
            "x": 11.5,
            "y": 47.3,
            "rect": {
              "x": 9.3,
              "y": 38.9,
              "width": 15.5,
              "height": 16.9
            }
          },
          {
            "title": "Connect branches",
            "detail": "In Stock & delivery, choose the inventory each branch uses and set its collection or delivery options.",
            "x": 27.7,
            "y": 47.3,
            "rect": {
              "x": 25.5,
              "y": 38.9,
              "width": 15.5,
              "height": 16.9
            }
          },
          {
            "title": "Review product listings",
            "detail": "Add product photos, categories and prices. Resolve anything flagged for review before it can go live.",
            "x": 43.9,
            "y": 47.3,
            "rect": {
              "x": 41.7,
              "y": 38.9,
              "width": 15.5,
              "height": 16.9
            }
          },
          {
            "title": "Open the public view",
            "detail": "After publishing the storefront, View storefront opens the page customers see. Paid checkout depends on marketplace availability and seller payment setup.",
            "x": 81.1,
            "y": 35.3,
            "rect": {
              "x": 78.9,
              "y": 33.2,
              "width": 10.7,
              "height": 4.2
            }
          }
        ],
        "id": "complete:seller-centre",
        "title": "Set up a Mi Marché storefront",
        "description": "Build your shop in Seller Centre and check the storefront preview before publishing.",
        "url": "platform/?view=seller",
        "audience": "stock",
        "capture": "seller-centre"
      },
      {
        "points": [
          {
            "title": "Enable collection for the branch",
            "detail": "In Stock & delivery, edit the branch and enable Free collection. Save the collection address for confirmed orders.",
            "x": 17.1,
            "y": 40.2,
            "rect": {
              "x": 14.9,
              "y": 38.8,
              "width": 23.4,
              "height": 2.9
            }
          },
          {
            "title": "Set the branch postcode area",
            "detail": "The postcode area is optional. The storefront uses it for an approximate straight-line distance when shoppers enter a UK postcode.",
            "x": 13.3,
            "y": 48.7,
            "rect": {
              "x": 11.1,
              "y": 45.2,
              "width": 14.1,
              "height": 6.9
            }
          },
          {
            "title": "Check the shopper view",
            "detail": "Open your storefront and use Check distance with a sample postcode.",
            "x": 28.1,
            "y": 50,
            "rect": {
              "x": 25.9,
              "y": 47.9,
              "width": 9.8,
              "height": 4.3
            }
          },
          {
            "title": "Choose collection in the basket",
            "detail": "Each branch has its own fulfilment choice. The pickup address is shown after payment.",
            "x": 67.1,
            "y": 55.1,
            "rect": {
              "x": 64.9,
              "y": 51.7,
              "width": 22.9,
              "height": 6.8
            }
          }
        ],
        "id": "complete:collection",
        "title": "Offer free collection",
        "description": "Show shoppers an approximate distance to a collection point if your branch has a postcode area.",
        "url": "platform/?view=seller",
        "audience": "stock",
        "capture": "storefront-collection"
      }
    ]
  }
];
    const legacy = [
  "free:Start on the dashboard",
  "free:Set up a location",
  "free:Add your first item",
  "free:Find and move stock",
  "free:Remove or discard stock",
  "free:Review slow-moving items",
  "starter:See full sales history",
  "starter:Record expenses and refunds",
  "starter:Make barcode labels",
  "starter:Reuse a print job",
  "starter:Pack and print shipping labels",
  "pro:Choose the right inventory",
  "pro:Choose location wording",
  "pro:Email shipping labels to your workspace",
  "pro:Create a reorder rule",
  "pro:Order, receive and assign",
  "pro:Choose email reminder timing",
  "business:Share a workspace",
  "business:Work from the same inventory",
  "business:Enable Manufacturing mode",
  "business:Receive measured materials",
  "business:Create a product recipe",
  "business:Preview and complete production",
  "business:Trace, hold or recall batches",
  "business:Maintain tools and set timers"
];
    function frameFor(name){
        return {...frames[name], id:name, src:"tutorial-assets/guide-2026-11/"+name+".jpg"};
    }
    for(const stage of stages){
        for(const step of stage.steps){
            if(!step.capture) continue;
            step.capture=frameFor(step.capture);
            step.image=step.capture.src;
            for(const point of step.points){
                if(point.frame) point.frame=frameFor(point.frame);
                else point.frame=step.capture;
            }
        }
    }
    window.InventoryGuideContent={stages,legacy};
})();
